/**
 * The voice plugin's page half: `start()` asks for the mic (the browser asks the user the first time) and
 * records it with `MediaRecorder`, sending what's spoken each second: the take's start to the `add` route,
 * the rest to `more/<id>`. So a take the page leaves in the middle of (a recording that goes on to another
 * page) is kept up to there. `stop` sends the last of it and lets the mic go, so the browser's recording
 * light goes out between takes.
 *
 * Its tool in the tool panel is the mic: on, it's a take, with its time and the mic's live waveform, so it's plain
 * it hears; off again, the clip goes in the tray, for the next task. While a recording is going the mic is the
 * recording's own, and this one is away.
 */
import { toolButton } from '#src/client/dom.ts';
import { liveWaveform } from '#src/client/waveform.ts';
import { playMark, trayed } from '#src/client/zone.ts';
import { defineClientPlugin } from '#src/index.ts';

import type { Clip, Take, Voice } from './index.ts';

const STYLE = `
.voice-tool .time { font: 12px ui-monospace, monospace; }
.voice-tool .wave { width: 44px; height: 18px; }
.tool-panel.vertical .voice-tool .wave { width: 28px; }
.voice-tool .mic[aria-pressed='true'], .voice-tool .mic[aria-pressed='true']:hover { background: #ef4444; color: #fff; }
/* The recordings plugin's own mic is in the panel while one is going (its \`.recorder.going\`): one mic at a time. */
.tool-panel:has(.recorder.going) :is(.voice-tool, .sep:has(+ .voice-tool)) { display: none; }
`;
const MIC = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>';

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** What the browser can record, best first: Opus in WebM where it can (Chrome, Firefox), else MP4 (Safari). */
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
/** How often what's spoken is sent, in milliseconds: what a page load can lose of a take. */
const EVERY = 1000;

export default defineClientPlugin<never, never, Voice>({
  name: 'voice',
  setup: ({ base, request, tools, tray, zone, lightbox }) => {
    const start = async (): Promise<Take> => {
      if (typeof MediaRecorder === 'undefined' || navigator.mediaDevices?.getUserMedia === undefined)
        throw new Error("voice: this browser can't record the mic here: it needs a secure page (https or localhost)");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((e: unknown) => {
        throw new Error(`voice: the mic isn't available: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
      });
      const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType === undefined ? {} : { mimeType });
      const typeOf = () => (recorder.mimeType || mimeType || 'audio/webm').split(';')[0]!;
      // The clip, once its start is kept, and where it is, where what keeps it says (a `standalone` build's does).
      let id: string | undefined;
      let url: string | undefined;
      // One request at a time, in the order spoken: the audio is its pieces end to end. The first problem ends the sending.
      let sent: Promise<void> = Promise.resolve();
      const send = (body: Blob | undefined, last = false) => {
        sent = sent.then(async () => {
          if (id === undefined && body === undefined) throw new Error('voice: the clip is empty: speak for a moment longer');
          const route = id === undefined ? 'add' : `more/${id}${last ? '?last' : ''}`;
          const res = await request(route, { method: 'POST', headers: { 'content-type': typeOf() }, ...(body ? { body } : {}) });
          const answer = (await res.json()) as { id?: string; url?: string; problem?: string };
          if (answer.id === undefined) throw new Error(`voice: ${answer.problem ?? res.statusText}`);
          id = answer.id;
          url = answer.url ?? url;
        });
        return sent;
      };
      recorder.addEventListener('dataavailable', (e) => {
        // Heard only at `stop`, with the rest: a problem here is that one's.
        if (e.data.size > 0) send(new Blob([e.data], { type: typeOf() })).catch(() => {});
      });
      const started = Date.now();
      recorder.start(EVERY);
      const release = () => {
        for (const track of stream.getTracks()) track.stop();
      };
      const ended = () =>
        new Promise<void>((done) => {
          if (recorder.state === 'inactive') return done();
          recorder.addEventListener('stop', () => done(), { once: true });
          recorder.stop();
        });

      return {
        started,
        stream,
        soFar: () => (id === undefined ? undefined : { id, duration: Date.now() - started }),
        cancel: () => {
          void ended().then(release);
        },
        stop: async (): Promise<Clip> => {
          await ended();
          release();
          const duration = Date.now() - started;
          // The last piece came as it stopped. This says it's over, to what names the clip's place only then.
          await send(undefined, true);
          return { id: id!, url: url ?? `${base}__deictic/plugins/voice/clip/${id}`, duration, type: typeOf() };
        },
      };
    };

    const group = Object.assign(document.createElement('div'), { className: 'tool-group voice-tool' });
    const time = Object.assign(document.createElement('span'), { className: 'time', hidden: true });
    const wave = Object.assign(document.createElement('canvas'), { className: 'wave', hidden: true });
    let take: Take | undefined;
    // What the mic is doing (asking for it, keeping a take): the next press waits for it.
    let busy: Promise<void> = Promise.resolve();
    const problem = (e: unknown) => {
      mic.classList.add('problem');
      mic.title = e instanceof Error ? e.message : String(e);
    };
    const on = async () => {
      const mine = await start();
      take = mine;
      // The panel stays while the mic is on: its button is what turns it off.
      const unkeep = tools.keep();
      const stopWave = liveWaveform(wave, mine.stream, { played: '#ef4444', rest: '#52525b' });
      const tick = () => (time.textContent = clock(Date.now() - mine.started));
      tick();
      const ticking = setInterval(tick, 250);
      time.hidden = wave.hidden = false;
      mic.setAttribute('aria-pressed', 'true');
      mic.title = 'Stop';
      return async () => {
        take = undefined;
        clearInterval(ticking);
        stopWave();
        time.hidden = wave.hidden = true;
        mic.setAttribute('aria-pressed', 'false');
        mic.title = 'Voice';
        unkeep();
        const clip = await mine.stop();
        tray.add('voice', clip.id, clip);
      };
    };
    let off: (() => Promise<void>) | undefined;
    const mic = toolButton(MIC, 'Voice', 'K', () => {
      busy = busy.then(async () => {
        mic.classList.remove('problem');
        try {
          if (off === undefined) {
            off = await on();
          } else {
            const ending = off;
            off = undefined;
            await ending();
          }
        } catch (e) {
          problem(e);
        }
      });
    });
    mic.classList.add('mic');
    mic.setAttribute('aria-pressed', 'false');
    group.append(Object.assign(document.createElement('style'), { textContent: STYLE }), mic, time, wave);
    tools.add(group);
    // In the drop zone until a task takes them: each plays in the lightbox.
    zone.add(
      trayed({ tray }, 'voice', 'Voice notes', (item, i, all) => {
        const { url, duration } = item.value as Clip;
        const name = `${all.length === 1 ? 'Voice' : `Voice ${i + 1}`} ${clock(duration)}`;
        return { label: [playMark(), name], open: (from) => lightbox([{ kind: 'audio', url, title: name }], { from }) };
      }),
    );
    // A take the page leaves in the middle of is kept as far as it's sent, and the mic let go.
    addEventListener('pagehide', () => take?.cancel());

    return { start };
  },
});
