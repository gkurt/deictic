/**
 * The recordings plugin's page half: `record()` starts rrweb (imported then) and shows the toolbar, a bar
 * docked to an edge of the window that its grip drags to any other, kept between recordings. It holds the
 * time, annotate mode's tools where that plugin is loaded, and Stop and Discard. Stop sends the events to
 * the `add` route.
 *
 * Nothing of deictic's is recorded: the overlay is blocked, as rrweb blocks. The marks are, as custom
 * events: the page's annotations and the toolbar's own, which go when it does, as SVGs in page
 * coordinates, at the start and at each change.
 */
import { liveWaveform } from '#src/client/waveform.ts';
import { defineClientPlugin } from '#src/index.ts';
import type { ResolvedMasking } from '#src/plugins/screenshots/index.ts';

import type { Take } from '#src/plugins/voice/index.ts';

import type { Kept, Recorder, Recording, VoiceClip } from './index.ts';
import { END, MARKS } from './marks.ts';
import { dropOurs } from './ours.ts';

type Edge = 'top' | 'bottom' | 'left' | 'right';
/** Where the bar is: the edge it's docked to, and how far along it, from 0 to 1. */
interface Dock {
  edge: Edge;
  along: number;
}

const DOCK = 'deictic:recorder';
const MARGIN = 12;

const STYLE = `
.recorder { position: fixed; z-index: 2147483647; display: flex; align-items: center; gap: 6px; padding: 6px 8px;
  border: 1px solid var(--deictic-line); border-radius: 10px; background: var(--deictic-bg); color: var(--deictic-fg);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.35); font: 13px/1.4 system-ui, sans-serif; user-select: none; }
.recorder.vertical { flex-direction: column; }
.recorder.vertical .annotations-tools { flex-direction: column; }
.recorder.vertical .annotations-tools .gap { width: auto; height: 1px; margin: 4px 2px; }
.recorder .grip { display: inline-flex; padding: 2px; color: var(--deictic-muted); cursor: grab; touch-action: none; }
.recorder .grip:active { cursor: grabbing; }
.recorder .grip svg { width: 16px; height: 16px; }
.recorder .live { display: inline-flex; align-items: center; gap: 6px; font: 12px ui-monospace, monospace; }
.recorder .dot { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: deictic-blink 1.2s infinite; }
.recorder .sep { align-self: stretch; width: 1px; background: var(--deictic-line); }
.recorder.vertical .sep { width: auto; height: 1px; }
.recorder .icon { display: inline-flex; align-items: center; justify-content: center; padding: 3px 5px; }
.recorder .icon svg { width: 16px; height: 16px; }
.recorder .mic[aria-pressed='true'] { background: #ef4444; border-color: #ef4444; color: #fff; }
.recorder .wave { width: 44px; height: 18px; }
.recorder.vertical .wave { width: 28px; }
.recorder .wave[hidden] { display: none; }
.recorder .mic.problem { border-color: var(--deictic-problem); color: var(--deictic-problem); }
@keyframes deictic-blink { 50% { opacity: 0.3; } }
`;

const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const GRIP = svg(
  '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
);
const STOP = svg('<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor"/>');
const DISCARD = svg('<path d="M6 6l12 12M18 6 6 18"/>');
const MIC = svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>');

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function storedDock(): Dock {
  try {
    const dock = JSON.parse(localStorage.getItem(DOCK) ?? 'null') as Dock | null;
    if (dock !== null && ['top', 'bottom', 'left', 'right'].includes(dock.edge) && dock.along >= 0 && dock.along <= 1) return dock;
  } catch {
    // Storage can be off, or hold something else: the default, then.
  }
  return { edge: 'bottom', along: 0.5 };
}

function iconButton(icon: string, name: string, run: () => void): HTMLButtonElement {
  const el = Object.assign(document.createElement('button'), { type: 'button', className: 'icon', title: name, innerHTML: icon });
  el.setAttribute('aria-label', name);
  el.addEventListener('click', run);
  return el;
}

/** Puts the bar on its edge, laid out along it, and how far along. */
function place(bar: HTMLElement, { edge, along }: Dock): void {
  bar.classList.toggle('vertical', edge === 'left' || edge === 'right');
  const { width, height } = bar.getBoundingClientRect();
  const across = (room: number, size: number) => `${MARGIN + along * Math.max(0, room - size - MARGIN * 2)}px`;
  Object.assign(bar.style, {
    left: edge === 'left' ? `${MARGIN}px` : edge === 'right' ? `${innerWidth - width - MARGIN}px` : across(innerWidth, width),
    top: edge === 'top' ? `${MARGIN}px` : edge === 'bottom' ? `${innerHeight - height - MARGIN}px` : across(innerHeight, height),
  });
}

/** Dragging the bar by its grip, freely; let go, it docks to the nearest edge. */
function draggable(bar: HTMLElement, grip: HTMLElement, docked: (dock: Dock) => void): void {
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const start = bar.getBoundingClientRect();
    const dx = e.clientX - start.left;
    const dy = e.clientY - start.top;
    const move = (m: PointerEvent) => {
      bar.style.left = `${m.clientX - dx}px`;
      bar.style.top = `${m.clientY - dy}px`;
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      const r = bar.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const away: [Edge, number][] = [
        ['left', x],
        ['right', innerWidth - x],
        ['top', y],
        ['bottom', innerHeight - y],
      ];
      const [edge] = away.reduce((a, b) => (b[1] < a[1] ? b : a));
      const ratio = (at: number, room: number) => Math.min(1, Math.max(0, at / room));
      docked({ edge, along: edge === 'left' || edge === 'right' ? ratio(y, innerHeight) : ratio(x, innerWidth) });
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up, { once: true });
  });
}

export default defineClientPlugin<never, never, Recorder>({
  name: 'recordings',
  setup: ({ base, root, options, use, request }) => {
    const { masking } = options as { masking: ResolvedMasking };
    let going = false;

    const record = async (): Promise<Recording | undefined> => {
      const rrweb = await import('rrweb').catch((e: unknown) => {
        throw new Error('recordings need rrweb: add it to your devDependencies', { cause: e });
      });
      const events: { type: number; data?: unknown }[] = [];
      const startedAt = Date.now();
      const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
      const colorScheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const host = root.host;
      const keep = dropOurs<(typeof events)[number]>(
        () => rrweb.record.mirror.getId(host),
        () => rrweb.record.mirror.getId(document.documentElement),
      );
      const stopRecording = rrweb.record({
        emit: (event) => {
          const kept = keep(event);
          if (kept !== undefined) events.push(kept);
        },
        blockClass: masking.blockClass,
        // deictic's own UI, the overlay: a blocked element is kept as an empty box its size, and it has none.
        blockSelector: ['deictic-overlay', ...(masking.blockSelector ? [masking.blockSelector] : [])].join(', '),
        maskTextClass: masking.maskTextClass,
        ...(masking.maskTextSelector ? { maskTextSelector: masking.maskTextSelector } : {}),
        maskAllInputs: masking.maskAllInputs,
        maskInputOptions: { password: true },
        inlineStylesheet: true,
      });

      // The marks, now and at each change: an SVG whose view is the page from its top left, at 1:1.
      const marks = use('annotations');
      // The toolbar's own, drawn while recording: shown with the page's, gone when it ends.
      const tools = marks?.tools();
      const mark = () => {
        const area = { x: -scrollX, y: -scrollY, width: 1, height: 1 };
        rrweb.record.addCustomEvent(MARKS, {
          svg: [marks?.svg(area), tools?.marks.svg(area)].filter(Boolean).join(''),
          // The same marks as data, in page coordinates, for whatever reads the recording but doesn't draw it.
          annotations: [...(marks?.list() ?? []), ...(tools?.marks.list() ?? [])],
        });
      };
      mark();
      const unsubscribe = [marks?.subscribe(mark), tools?.marks.subscribe(mark)];

      return new Promise((done, fail) => {
        const bar = document.createElement('div');
        bar.className = 'recorder';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Recording');
        const grip = Object.assign(document.createElement('span'), { className: 'grip', title: 'Drag to any edge', innerHTML: GRIP });
        const live = Object.assign(document.createElement('span'), { className: 'live' });
        const dot = Object.assign(document.createElement('span'), { className: 'dot' });
        const time = document.createElement('span');
        live.append(dot, time);
        const sep = () => Object.assign(document.createElement('span'), { className: 'sep' });

        // The mic, where the voice plugin is loaded: each stretch it's on is a clip, at its time in the recording.
        const voice = use('voice');
        const clips: VoiceClip[] = [];
        let take: Take | undefined;
        // The mic's live waveform beside it while it's on, so it's plain it hears.
        const wave = Object.assign(document.createElement('canvas'), { className: 'wave', hidden: true });
        let stopWave: (() => void) | undefined;
        const unwave = () => {
          stopWave?.();
          stopWave = undefined;
          wave.hidden = true;
        };
        // What the mic is doing (asking for it, keeping a take): the next toggle, and the end, wait for it.
        let busy: Promise<void> = Promise.resolve();
        const micOff = async () => {
          const ending = take;
          take = undefined;
          unwave();
          if (ending === undefined) return;
          try {
            const clip = await ending.stop();
            clips.push({ id: clip.id, at: ending.started - startedAt, duration: clip.duration });
          } catch (e) {
            // The recording is worth keeping without it.
            console.warn('deictic: the voice clip was not kept', e);
          }
        };
        const mic = voice === undefined ? undefined : iconButton(MIC, 'Turn the mic on', () => toggle());
        const toggle = () => {
          busy = busy.then(async () => {
            if (voice === undefined || mic === undefined) return;
            if (take !== undefined) {
              await micOff();
            } else {
              try {
                take = await voice.start();
                mic.classList.remove('problem');
                wave.hidden = false;
                stopWave = liveWaveform(wave, take.stream, { played: '#ef4444', rest: '#52525b' });
              } catch (e) {
                mic.classList.add('problem');
                mic.title = e instanceof Error ? e.message : String(e);
                return;
              }
            }
            const on = take !== undefined;
            mic.setAttribute('aria-pressed', String(on));
            mic.title = on ? 'Turn the mic off' : 'Turn the mic on';
            mic.setAttribute('aria-label', mic.title);
          });
        };
        mic?.classList.add('mic');
        mic?.setAttribute('aria-pressed', 'false');

        const end = async (keep: boolean) => {
          rrweb.record.addCustomEvent(END, {});
          stopRecording?.();
          for (const stop of unsubscribe) stop?.();
          tools?.close();
          clearInterval(ticking);
          removeEventListener('resize', replace);
          bar.remove();
          await busy;
          if (!keep) {
            unwave();
            take?.cancel();
            return done(undefined);
          }
          await micOff();
          const duration = Date.now() - startedAt;
          const voiced = clips.length > 0 ? { voice: clips } : {};
          const kept: Kept = { page: location.href, viewport, colorScheme, startedAt, duration, events, ...voiced };
          try {
            const res = await request('add', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(kept),
            });
            const { id, problem } = (await res.json()) as { id?: string; problem?: string };
            if (id === undefined) throw new Error(`recordings: ${problem ?? res.statusText}`);
            done({ id, url: `${base}__deictic/plugins/recordings/replay/${id}`, duration, ...voiced });
          } catch (e) {
            fail(e);
          }
        };
        const stop = iconButton(STOP, 'Stop, and keep the recording', () => void end(true));
        const discard = iconButton(DISCARD, 'Discard the recording', () => void end(false));
        bar.append(grip, live, ...(tools ? [sep(), tools.element] : []), sep(), ...(mic ? [mic, wave] : []), stop, discard);
        const style = Object.assign(document.createElement('style'), { textContent: STYLE });
        bar.prepend(style);
        root.append(bar);

        const tick = () => (time.textContent = clock(Date.now() - startedAt));
        tick();
        const ticking = setInterval(tick, 250);
        let dock = storedDock();
        const replace = () => place(bar, dock);
        replace();
        addEventListener('resize', replace);
        draggable(bar, grip, (next) => {
          dock = next;
          replace();
          try {
            localStorage.setItem(DOCK, JSON.stringify(dock));
          } catch {
            // Not kept, then: the next recording starts at the bottom.
          }
        });
      });
    };

    return {
      recording: () => going,
      record: async () => {
        if (going) throw new Error('recordings: one is going already: stop it first');
        going = true;
        try {
          return await record();
        } finally {
          going = false;
        }
      },
    };
  },
});
