/**
 * The composer: a field as a chat has, shared by the Task tab (a new task) and a task's thread in the drawer (a
 * reply). What's attached is chips over the words, and under them the buttons that attach, each an icon named by its
 * tooltip, and the arrow that sends. Enter sends, and Shift+Enter starts a new line.
 *
 * Two buttons are on or off. With the screenshots plugin, a shot of the page goes as it's sent, the elements
 * outlined in it (or the spot circled): nothing else says which of two rows alike was meant. And, for a task, the
 * element's HTML as it rendered, as a file. The rest make something: Draw takes a shot and opens it to draw on, in the
 * annotations plugin's editor; Record is the caller's (the Task tab leaves the popup to record the page); Voice
 * records the mic here, its time and waveform beside it.
 *
 * A task's elements are chips too: the one the popup is on to begin with, and any other the element button's next
 * press on the page picks. A reply has none.
 *
 * A picture pasted in, or dropped on it, is a screenshot of its own, in the tray, to draw on as one drawn here is.
 *
 * What they make, and what the tool panel's tools made since (the tray), is this one's to attach. Each is a chip,
 * which opens it; removing one takes it out of the tray. Once it's sent, they're gone from the tray, and the page's
 * marks with them.
 */
import { named, tell } from '#src/client/component.ts';
import { place, targetOf, toolButton } from '#src/client/dom.ts';
import { liveWaveform } from '#src/client/waveform.ts';
import type { ClientContext, LightboxItem, Point, Target } from '#src/index.ts';

// For `use()`'s types: the plugins may not be loaded, and nothing of them runs here.
import type { Annotation, Annotations, Picture } from '#src/plugins/annotations/index.ts';
import type { Recording } from '#src/plugins/recordings/index.ts';
import type { Capture, Shot } from '#src/plugins/screenshots/index.ts';
import type { Clip, Take } from '#src/plugins/voice/index.ts';

import type { Marks, Op } from './index.ts';

/** Scoped to the composer: the drawer and the Task tab share the overlay's root, and a field of theirs is their own. */
export const COMPOSER_STYLE = `
/* One box for what's attached, the words and the buttons, lit as a field is while it's typed in. */
.composer { border: 1px solid var(--deictic-line); border-radius: 12px; background: rgb(0 0 0 / 0.35); }
.composer:focus-within, .composer.dropping { border-color: var(--deictic-accent); box-shadow: 0 0 0 1px var(--deictic-accent); }
.composer textarea { display: block; box-sizing: border-box; width: 100%; min-height: 0; padding: 10px 12px 4px; border: 0; resize: none; background: none; font: 13px/1.45 system-ui, sans-serif; }
.composer textarea:focus { outline: none; }
.composer .chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0; padding: 8px 8px 0; font-size: 12px; }
.composer .attach { display: flex; align-items: center; gap: 2px; padding: 4px 6px 6px; }
.composer .attach button.icon { width: 28px; height: 28px; border-radius: 8px; }
.composer .attach button.icon svg { width: 16px; height: 16px; }
.composer .attach button[aria-pressed='true'] { color: var(--deictic-accent); background: rgb(18 179 88 / 0.14); }
.composer .attach .gap { width: 1px; height: 16px; margin: 0 4px; background: var(--deictic-line); }
.composer .attach .mic[aria-pressed='true'], .composer .attach .mic[aria-pressed='true']:hover { color: #fff; background: #ef4444; }
.composer .hearing { display: inline-flex; align-items: center; gap: 6px; padding-left: 4px; font: 12px ui-monospace, monospace; color: var(--deictic-muted); }
.composer .hearing canvas { width: 56px; height: 18px; }
.composer .doing { margin-left: auto; padding-right: 6px; font-size: 12px; color: var(--deictic-muted); }
.composer .attach button.send { border-radius: 50%; color: var(--deictic-on-accent); }
.composer .attach button.send:hover:not(:disabled) { color: var(--deictic-on-accent); background: var(--deictic-accent); filter: brightness(1.1); }
.composer [hidden] { display: none; }
/* Every chip one height, and a picture's thumbnail one size whatever its shape or whether it has loaded yet: nothing
   moves as one is attached, or as its picture comes. */
.chip { box-sizing: border-box; display: inline-flex; align-items: center; height: 30px; border: 1px solid var(--deictic-line); border-radius: 6px; }
.chip button { height: 100%; border: 0; }
.chip .open { display: inline-flex; align-items: center; gap: 6px; padding: 0 4px 0 2px; }
.chip img { display: block; width: 36px; height: 24px; object-fit: cover; border-radius: 4px; background: var(--deictic-line); }
.chip .play { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 4px; background: var(--deictic-line); }
.chip .play svg { width: 12px; height: 12px; }
.chip .play.drawn svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.chip .remove { padding: 0 6px; color: var(--deictic-muted); }
.chip .remove:hover { color: var(--deictic-fg); }
/* An element the task is about: named as the caption names it, in the overlay's own green. */
.chip.about .open { padding: 0 4px 0 8px; font: 12px ui-monospace, monospace; color: var(--deictic-accent); }
.chip.about .open span { color: var(--deictic-muted); }
.compose .shot-problem { margin-top: 4px; font-size: 12px; color: var(--deictic-problem); }
.compose .shot-problem:empty { display: none; }
.compose .shot-note { margin-top: 4px; font-size: 12px; color: var(--deictic-muted); }
.compose .shot-note:empty { display: none; }
`;

export const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" fill="currentColor"/></svg>';
/** The composer's buttons, each its strokes on a 24-pixel grid. */
const CAMERA = '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>';
const CODE = '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14"/>';
export const PEN = '<path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z"/>';
const RECORD = '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>';
const MIC = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>';
const SEND = '<path d="M12 19V5M6 11l6-6 6 6"/>';
const TARGET = '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>';
/** How tall the field grows with what's typed, in pixels, before it scrolls. */
const GROWN = 200;

/** The overlay's own green, as its ring on the element while the popup is open. */
const OUTLINE = '#12b358';
/** CSS pixels between the element and its outline, so the dashes are on nothing of the element's. */
const ROOM = 3;
/** How far around a spot its circle is drawn in a shot, in CSS pixels. */
const SPOT = 16;

/** The tray's kinds a composer attaches. */
const KINDS = ['screenshots', 'recordings', 'voice'];

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

export const atOf = ({ loc }: Target) => `${loc.file}:${loc.line}:${loc.column}`;

export const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Marks as a task tells of them: how many, and what the notes say. */
function marksOf(list: readonly Annotation[]): Marks {
  return { count: list.length, notes: list.flatMap(({ shape }) => (shape.kind === 'note' ? [shape.text] : [])) };
}

/** The page's annotations, where there are any. */
function annotationsOf(marks: Annotations | undefined): Marks | undefined {
  const list = marks?.list() ?? [];
  return list.length === 0 ? undefined : marksOf(list);
}

/**
 * A shot as the tray has it: the window's, from the tool panel, or one that was drawn on here. That one's PNG has the
 * marks in it, and it keeps what it was made of, to draw on it again: the shot as taken, the marks, and the element it
 * was taken of (`file:line:column`), as only a task about that element can say where the element is in it.
 */
type Pictured = Shot & { drawn?: { shot: Shot; marks: Annotation[]; about: string } };

/** A shot as it's attached, and where it is, for the page to hear of; what's sent goes without that. */
export type Sent = NonNullable<Op['screenshots']>[number] & { url: string };

/** What a task says of an element that only the page with it on knows. */
export interface Seen extends Pick<Op, 'point' | 'pointed' | 'count' | 'which' | 'chain'> {
  /** The element's HTML, as it would be attached. */
  html: string;
  /** What React's DevTools would show of it, `react.json`, where the react plugin is loaded and React wrote it. */
  react?: string;
}

/**
 * An element the task is about, a chip in the composer: its place, the element where this page has it, and what
 * the page said of it as the panel left for a recording, for a page that no longer has it. `own` is the popup's.
 */
export interface About {
  target: Target;
  own: boolean;
  el?: Element;
  seen?: Seen;
}

export const onPage = (a: About | undefined): Element | undefined => (a?.el?.isConnected === true ? a.el : undefined);

/** What's sent: the words, and all that's attached, as the composer has it. */
export interface Gathered {
  text: string;
  /** The elements attached, in order: none for a reply, or for a task about the page. */
  about: About[];
  /** Whether the elements' HTML goes too. */
  html: boolean;
  screenshots?: Sent[];
  recordings: Recording[];
  voices: Clip[];
  /** What's drawn on the page, where something is. */
  annotations?: Marks;
}

/** What's attached, as a task's op or a reply sends it: each shot, each recording with where it replays, each voice note, the marks. */
export function attachedOf({
  screenshots,
  recordings,
  voices,
  annotations,
}: Gathered): Pick<Op, 'screenshots' | 'recordings' | 'voice' | 'annotations'> {
  return {
    ...(screenshots === undefined ? {} : { screenshots: screenshots.map(({ url: _, ...shot }) => shot) }),
    ...(recordings.length === 0
      ? {}
      : {
          recordings: recordings.map(({ id, duration, url, voice: clips }) => ({
            id,
            duration,
            replay: new URL(url, location.href).href,
            ...(clips === undefined ? {} : { voice: clips.map((c) => c.id) }),
          })),
        }),
    ...(voices.length === 0 ? {} : { voice: voices.map(({ id, duration }) => ({ id, duration })) }),
    ...(annotations === undefined ? {} : { annotations }),
  };
}

/** What's typed and asked for, to keep while the composer is away and give back to one made again. */
export interface Draft {
  text: string;
  /** Whether a shot was asked for, or asked not to be, where either was. */
  shot?: boolean;
  html: boolean;
  about: About[];
}

export interface ComposerOptions {
  placeholder: string;
  /** What the arrow does, as its tooltip says: `Add task`, `Reply`. */
  sendLabel: string;
  /**
   * The elements attached to begin with, and again once it's sent: a task's. With them come their chips, the element
   * button and HTML snapshot; a reply has none of them.
   */
  about?: () => About[];
  /** Whether the HTML snapshot button is there, for a task with elements: the tasks plugin's `html` option. */
  html?: boolean;
  /** The spot in the popup's own element, circled in a shot of it. */
  at?: Point;
  /** Whether a shot is taken as it's sent, while nothing else is attached and none was asked for or not: a task's. */
  shoot?: boolean;
  /**
   * The popup's own element as the press that opened it froze the page (`screenshots.frozen`): what a shot of it is,
   * rather than the page as it is when it's sent, by which time a tooltip or a menu may have closed.
   */
  frozen?: Promise<Shot>;
  /** Whether this page has what's shot and drawn on: not for a task back from a recording on a page without it. */
  here?: boolean;
  /** Whether it's over the page, in the overlay's root: a press on the page picks an element, and attached ones are outlined. */
  over: boolean;
  /** What Record does, where it's there at all: the Task tab leaves the popup to record the page. */
  record?: () => void;
  /** Sends it; answers whether it's taken, which empties the composer. A refusal thrown is said under it. */
  submit: (gathered: Gathered) => Promise<boolean>;
  /** Hears a change to what leaving would lose: what's typed, or a take going. */
  changed?: () => void;
}

export interface Composer {
  /** The composer, and under it what went wrong and what was done. */
  el: HTMLElement;
  /** The arrow: what an unsaved change keeps a popup open with. */
  send: HTMLButtonElement;
  problem: HTMLElement;
  note: HTMLElement;
  /** Whether leaving now loses something: words typed, or a take going. */
  pending: () => boolean;
  draft: () => Draft;
  restore: (draft: Partial<Draft>) => void;
  /** Ends a take going, keeping its clip in the tray. */
  stopTake: () => Promise<void>;
  focus: () => void;
  /** Lets it go: a take going is kept, in the tray. */
  destroy: () => void;
}

/**
 * A shot's PNG with what the task is about outlined in it: dashes around each box, with nothing between them, and a
 * circle around `spot`. The shot may have more pixels than its size in CSS ones, which the boxes are in.
 */
async function outlined(png: string, size: Shot['size'], boxes: Shot['box'][], spot?: Point): Promise<Blob> {
  const image = new Image();
  image.src = png;
  await image.decode();
  const canvas = element('canvas', { width: image.naturalWidth, height: image.naturalHeight });
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error("tasks: this browser won't draw to a canvas");
  ctx.drawImage(image, 0, 0);
  const k = image.naturalWidth / size.width;
  ctx.lineWidth = 2 * k;
  ctx.strokeStyle = OUTLINE;
  ctx.setLineDash([6 * k, 4 * k]);
  for (const box of boxes) ctx.strokeRect((box.x - ROOM) * k, (box.y - ROOM) * k, (box.width + 2 * ROOM) * k, (box.height + 2 * ROOM) * k);
  if (spot !== undefined) {
    ctx.beginPath();
    ctx.arc(spot.x * k, spot.y * k, SPOT * k, 0, 2 * Math.PI);
    ctx.stroke();
  }
  return await new Promise<Blob>((done, fail) =>
    canvas.toBlob((blob) => (blob === null ? fail(new Error('tasks: the screenshot drew nothing')) : done(blob)), 'image/png'),
  );
}

/** A picture as a PNG, and its size: the screenshots plugin keeps PNGs, and a pasted one may be a JPEG or a GIF. */
async function pngOf(picture: Blob): Promise<{ png: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(picture);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (picture.type === 'image/png') return { png: picture, width, height };
    const canvas = element('canvas', { width, height });
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error("tasks: this browser won't draw to a canvas");
    ctx.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((done, fail) =>
      canvas.toBlob((blob) => (blob === null ? fail(new Error('tasks: the picture drew nothing')) : done(blob)), 'image/png'),
    );
    return { png, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function composerIn(context: ClientContext, options: ComposerOptions): Composer {
  const shots = context.use('screenshots');
  const notes = context.use('annotations');
  const recorder = context.use('recordings');
  const voice = context.use('voice');
  const { tray } = context;
  const here = options.here ?? true;
  const withElements = options.about !== undefined;

  // What it's about, in the order attached.
  let about: About[] = options.about?.() ?? [];

  // A shot as it goes: said (on, or off), or else, where it's wanted at all, only while nothing else is attached.
  let wanted: boolean | undefined;
  const shooting = () => shots !== undefined && here && (wanted ?? (options.shoot === true && attachedCount() === 0));
  let withHtml = true;

  const text = element('textarea', { placeholder: options.placeholder, rows: 1 });
  const chipsEl = element('div', { className: 'chips' });
  /** A shot of `of`: as the press froze it, where it's the popup's own element still first, else as the page is now. */
  const shotOf = (s: Capture, of: Element) => {
    const frozen = about[0]?.own === true && onPage(about[0]) === of ? options.frozen : undefined;
    return frozen === undefined ? s.capture(of) : frozen.catch(() => s.capture(of));
  };
  const camera = toolButton(
    CAMERA,
    options.frozen === undefined ? `Attach a screenshot, taken as it's sent` : 'Attach a screenshot of the page as it was when you pressed',
    undefined,
    () => {
      wanted = !shooting();
      showChips();
    },
  );
  camera.hidden = shots === undefined || !here;
  const code = toolButton(CODE, 'Attach an HTML snapshot: the element as the page has it now, as a file', undefined, () => {
    withHtml = !withHtml;
    showChips();
  });
  code.hidden = !withElements || options.html === false;
  const picker = toolButton(TARGET, 'Attach another element: press it on the page', undefined, () => void pick());
  picker.setAttribute('aria-pressed', 'false');
  // Not where there's no page under it to press on.
  picker.hidden = !withElements || !options.over;
  const pen = toolButton(PEN, 'Draw on a screenshot', undefined, () => void draw());
  pen.hidden = shots === undefined || notes === undefined || !here;
  const record = toolButton(RECORD, 'Record the page', undefined, () => {
    if (!sending) options.record?.();
  });
  record.hidden = recorder === undefined || options.record === undefined;
  const mic = toolButton(MIC, 'Record your voice', undefined, () => void (take === undefined ? speakOn() : speakOff()));
  mic.classList.add('mic');
  mic.hidden = voice === undefined;
  // Between what's on or off and what makes something, where there's some of both.
  const gap = element('span', {
    className: 'gap',
    hidden: (camera.hidden && code.hidden) || (picker.hidden && pen.hidden && record.hidden && mic.hidden),
  });
  // The time and the mic's live waveform while a take goes, so it's plain it hears.
  const time = element('span');
  const wave = element('canvas');
  const hearing = element('span', { className: 'hearing', hidden: true });
  hearing.append(time, wave);
  // What the arrow waits on, while it does: a shot being taken.
  const doing = element('span', { className: 'doing' });
  const send = toolButton(SEND, options.sendLabel, 'Enter', () => void sendIt());
  send.classList.add('send', 'primary');
  const attach = element('div', { className: 'attach' });
  attach.append(camera, code, gap, picker, pen, record, mic, hearing, doing, send);
  const box = element('div', { className: 'composer' });
  box.append(chipsEl, text, attach);
  const problem = element('div', { className: 'shot-problem' });
  const note = element('div', { className: 'shot-note' });
  const el = element('div', { className: 'compose' });
  el.append(box, problem, note);
  // As tall as what's typed, to a point.
  const grow = () => {
    text.style.height = 'auto';
    text.style.height = `${Math.min(text.scrollHeight, GROWN)}px`;
  };

  // What the tool panel's tools made and nothing has taken: this one's to attach, as each plugin said it.
  const inTray = <T>(plugin: string) => tray.list(plugin).map((item) => item.value as T);
  const taken = () => ({
    pictures: inTray<Pictured>('screenshots'),
    recordings: inTray<Recording>('recordings'),
    voices: inTray<Clip>('voice'),
  });
  const attachedCount = () => KINDS.reduce((n, plugin) => n + tray.list(plugin).length, 0);
  // It goes with words, or with something attached that says it; not while it's going.
  let sending = false;
  let take: Take | undefined;
  const able = () => (send.disabled = sending || (text.value.trim() === '' && attachedCount() === 0 && take === undefined));
  const changed = () => options.changed?.();

  const chip = (content: (string | Node)[], title: string, at: number, remove: string, drop: () => void) => {
    const opener = element('button', { type: 'button', className: 'open', title });
    opener.append(...content);
    // Every attachment in one lightbox, opened at this one, growing out of its chip.
    opener.addEventListener('click', () => context.lightbox(viewed(), { at, from: it }));
    const remover = element('button', { type: 'button', className: 'remove', textContent: '×', title: remove });
    remover.addEventListener('click', drop);
    const it = element('span', { className: 'chip' });
    it.append(opener, remover);
    return it;
  };
  const numbered = (name: string, i: number, of: number) => (of === 1 ? name : `${name} ${i + 1}`);
  /** What's attached, as the lightbox shows it, in the chips' order. */
  const viewed = (): LightboxItem[] => {
    const { pictures, recordings, voices } = taken();
    return [
      ...pictures.map((s, i) => ({
        kind: 'image' as const,
        url: s.url,
        title: numbered('Screenshot', i, pictures.length),
        ...(s.drawn === undefined
          ? {}
          : {
              actions: [
                s.drawn.marks.length === 0
                  ? { label: 'Draw on it', title: 'Draw boxes, arrows and notes on it', run: () => void draw(s) }
                  : { label: 'Change marks', title: 'Draw on it again', run: () => void draw(s) },
              ],
            }),
      })),
      ...recordings.map((r, i) => ({
        kind: 'page' as const,
        // The replay filling the frame, without a header of its own: the lightbox names it.
        url: `${r.url}${r.url.includes('?') ? '&' : '?'}embed`,
        title: `${numbered('Recording', i, recordings.length)} · ${clock(r.duration)}`,
        actions: [
          { label: 'New tab', title: 'Play it back in a tab of its own', run: () => void window.open(r.url, '_blank', 'noopener') },
        ],
      })),
      ...voices.map((v, i) => ({
        kind: 'audio' as const,
        url: v.url,
        title: `${numbered('Voice', i, voices.length)} · ${clock(v.duration)}`,
      })),
    ];
  };
  /** Takes one out of the tray. A shot that was the last thing attached leaves none asked for: taking it out said so. */
  const drop = (plugin: string, id: string) => () => {
    tray.remove(plugin, id);
    if (plugin === 'screenshots' && attachedCount() === 0) wanted = false;
    showChips();
  };
  /** An element the task is about: named as the caption names it, with its place for a tip. Its chip shows it, and its × leaves it out. */
  const aboutChip = (a: About) => {
    const it = onPage(a);
    const { file, line } = a.target.loc;
    const { component, sole, tag } = it === undefined ? { component: undefined, sole: false, tag: a.target.tag } : named(it);
    const opener = element('button', { type: 'button', className: 'open', title: `${file}:${line}` });
    opener.append(`<${component ?? tag}>`, ...(component === undefined || sole ? [] : [element('span', { textContent: ` <${tag}>` })]));
    opener.addEventListener('click', () => it?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    const name = it === undefined ? `<${tag}>` : tell(named(it));
    const remover = element('button', { type: 'button', className: 'remove', textContent: '×', title: `Leave ${name} out` });
    remover.addEventListener('click', () => {
      about = about.filter((x) => x !== a);
      showChips();
    });
    const chipEl = element('span', { className: 'chip about' });
    chipEl.append(opener, remover);
    return chipEl;
  };
  /** What's drawn on the page, which goes with it: its chip draws more, and its × clears it. */
  const marksChip = (marked: number) => {
    const opener = element('button', { type: 'button', className: 'open', title: 'Draw more on the page' });
    const icon = element('span', { className: 'play drawn', innerHTML: `<svg viewBox="0 0 24 24" aria-hidden="true">${PEN}</svg>` });
    opener.append(icon, `${marked} mark${marked === 1 ? '' : 's'}`);
    opener.addEventListener('click', () => notes?.draw());
    const remover = element('button', { type: 'button', className: 'remove', textContent: '×', title: 'Clear the marks' });
    remover.addEventListener('click', () => notes?.clear());
    const it = element('span', { className: 'chip' });
    it.append(opener, remover);
    return it;
  };
  const showChips = () => {
    const { pictures, recordings, voices } = taken();
    const marked = notes?.list().length ?? 0;
    camera.setAttribute('aria-pressed', String(shooting()));
    code.setAttribute('aria-pressed', String(withHtml));
    chipsEl.hidden = about.length === 0 && attachedCount() === 0 && marked === 0;
    chipsEl.replaceChildren(
      ...about.map(aboutChip),
      ...pictures.map((s, i) => {
        const name = numbered('Screenshot', i, pictures.length);
        const thumb = element('img', { src: s.url, alt: '' });
        return chip([thumb, name], `Open ${name.toLowerCase()}`, i, `Remove ${name.toLowerCase()}`, drop('screenshots', s.id));
      }),
      ...recordings.map((r, i) => {
        const name = numbered('Recording', i, recordings.length);
        const play = element('span', { className: 'play', innerHTML: PLAY });
        return chip(
          [play, `${name} ${clock(r.duration)}${r.voice === undefined ? '' : ' · voice'}`],
          `Play ${name.toLowerCase()} back`,
          pictures.length + i,
          `Remove ${name.toLowerCase()}`,
          drop('recordings', r.id),
        );
      }),
      ...voices.map((v, i) => {
        const name = numbered('Voice', i, voices.length);
        const play = element('span', { className: 'play', innerHTML: PLAY });
        return chip(
          [play, `${name} ${clock(v.duration)}`],
          `Play ${name.toLowerCase()}`,
          pictures.length + recordings.length + i,
          `Remove ${name.toLowerCase()}`,
          drop('voice', v.id),
        );
      }),
      ...(marked === 0 ? [] : [marksChip(marked)]),
    );
    able();
  };
  // As the tray changes: a shot taken from the panel while this is open is a chip at once. The marks too.
  const unsubscribe = [tray.subscribe(showChips), notes?.subscribe(showChips)];

  // The element button: the next press on the page attaches the marked element under it.
  let picking = false;
  const pick = async () => {
    if (picking) return;
    picking = true;
    picker.setAttribute('aria-pressed', 'true');
    const spot = await context.tools.pick();
    picking = false;
    picker.setAttribute('aria-pressed', 'false');
    const target = spot === undefined ? undefined : targetOf(spot.element);
    if (spot === undefined || target === undefined) return;
    // Only what the press was on: the element nearest to a press on none isn't what was meant.
    const r = spot.element.getBoundingClientRect();
    if (spot.at.x < 0 || spot.at.y < 0 || spot.at.x > r.width || spot.at.y > r.height) return;
    if (about.some((a) => a.el === spot.element)) return;
    about = [...about, { target, own: false, el: spot.element }];
    showChips();
  };
  // Each attached element on the page, outlined where it is, but the popup's own: that one has the light.
  const outlines = withElements && options.over ? element('div') : undefined;
  if (outlines !== undefined) context.root.append(outlines);
  let following = 0;
  const follow = () => {
    following = requestAnimationFrame(follow);
    if (outlines === undefined) return;
    const others = about.flatMap((a) => (a.own || onPage(a) === undefined ? [] : [onPage(a)!]));
    while (outlines.childElementCount > others.length) outlines.lastElementChild!.remove();
    while (outlines.childElementCount < others.length) outlines.append(element('div', { className: 'task-about' }));
    for (const [i, it] of others.entries()) place(outlines.children[i] as HTMLElement, it.getBoundingClientRect());
  };
  if (outlines !== undefined) follow();

  // Draw: a shot is taken and opened to draw on, or a chip's opened again. Saved, the PNG of both is kept as a
  // shot of its own, in the tray, so it's a chip as any other is.
  const firstAt = () => (about[0] === undefined ? '' : atOf(about[0].target));
  const aborts = new AbortController();
  let drawing = false;
  const draw = async (old?: Pictured) => {
    if (shots === undefined || notes === undefined || drawing || sending) return;
    drawing = true;
    problem.textContent = '';
    try {
      if (old === undefined) doing.textContent = 'Capturing…';
      const shot = old?.drawn?.shot ?? (await shotOf(shots, onPage(about[0]) ?? document.documentElement));
      doing.textContent = '';
      const picture: Picture = { url: shot.url, ...shot.size };
      const marks = await notes.edit(picture, old?.drawn?.marks ?? [], { signal: aborts.signal });
      if (marks === undefined) return;
      doing.textContent = 'Saving…';
      const kept = await shots.upload(await notes.flatten(picture, marks), shot);
      if (old !== undefined) tray.remove('screenshots', old.id);
      const pictured: Pictured = { ...kept, drawn: { shot, marks, about: old?.drawn?.about ?? firstAt() } };
      tray.add('screenshots', kept.id, pictured);
    } catch (e) {
      problem.textContent = messageOf(e);
    } finally {
      doing.textContent = '';
      drawing = false;
      // Back to the words: the editor gave the focus to the button that opened it.
      text.focus();
    }
  };

  /**
   * Pictures pasted in or dropped on it: each kept as a shot of its own (a PNG, as the screenshots plugin keeps them)
   * and put in the tray, so it's a chip as any other is, to draw on. Anything else is said, not attached.
   */
  const paste = async (files: File[]) => {
    const pictures = files.filter((file) => file.type.startsWith('image/'));
    const others = files.length - pictures.length;
    problem.textContent = '';
    if (pictures.length > 0 && shots === undefined)
      problem.textContent = 'Attaching a picture needs the screenshots plugin: add it to deictic';
    else if (others > 0)
      problem.textContent = `Only pictures can be attached here: ${others === 1 ? 'that file was' : `${others} files were`} left out`;
    if (shots === undefined || pictures.length === 0) return;
    doing.textContent = 'Attaching…';
    try {
      for (const picture of pictures) {
        const { png, width, height } = await pngOf(picture);
        const size = { width, height };
        const kept = await shots.upload(png, { box: { x: 0, y: 0, ...size }, size });
        // Drawn on with no marks yet: its lightbox offers to draw on it, as one drawn here does.
        const pictured: Pictured = { ...kept, drawn: { shot: kept, marks: [], about: '' } };
        tray.add('screenshots', kept.id, pictured);
      }
    } catch (e) {
      problem.textContent = messageOf(e);
    } finally {
      doing.textContent = '';
    }
  };
  box.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length === 0) return;
    // A picture isn't text: nothing goes in the field for it.
    e.preventDefault();
    void paste(files);
  });
  box.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    box.classList.add('dropping');
  });
  box.addEventListener('dragleave', () => box.classList.remove('dropping'));
  box.addEventListener('drop', (e) => {
    box.classList.remove('dropping');
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length === 0) return;
    e.preventDefault();
    void paste(files);
  });

  // The mic, here: its button starts a take, and stops it, and it's a chip.
  let ticking: ReturnType<typeof setInterval> | undefined;
  let stopWave: (() => void) | undefined;
  const speakOn = async () => {
    if (voice === undefined) return;
    problem.textContent = '';
    mic.disabled = true;
    try {
      take = await voice.start();
    } catch (e) {
      problem.textContent = messageOf(e);
      return;
    } finally {
      mic.disabled = false;
    }
    const { started, stream } = take;
    stopWave = liveWaveform(wave, stream, { played: '#ef4444', rest: '#52525b' });
    const tick = () => (time.textContent = clock(Date.now() - started));
    tick();
    ticking = setInterval(tick, 250);
    hearing.hidden = false;
    mic.setAttribute('aria-pressed', 'true');
    mic.title = 'Stop, and attach it';
    able();
    changed();
  };
  const speakOff = async () => {
    const ending = take;
    if (ending === undefined) return;
    take = undefined;
    clearInterval(ticking);
    stopWave?.();
    stopWave = undefined;
    hearing.hidden = true;
    mic.setAttribute('aria-pressed', 'false');
    mic.title = 'Record your voice';
    try {
      const clip = await ending.stop();
      tray.add('voice', clip.id, clip);
    } catch (e) {
      problem.textContent = messageOf(e);
    }
    able();
    changed();
  };

  /**
   * The shots to attach: one taken now, where that's on, and those in the tray, each the window as it was taken.
   * Only the first has the elements outlined in it, and its spot circled (or is as it was taken, where that can't be
   * drawn), so it's first: nothing else in a shot says what it's about.
   */
  const screenshotsOf = async (): Promise<Sent[] | undefined> => {
    if (shots === undefined) return undefined;
    // One drawn on says its notes, and where the element is in it, where it's the first one it was taken of.
    const kept: Sent[] = taken().pictures.map(({ id, url, drawn }) => ({
      id,
      url,
      ...(drawn !== undefined && drawn.about !== '' && drawn.about === firstAt() ? { box: drawn.shot.box } : {}),
      ...(drawn === undefined || drawn.marks.length === 0 ? {} : { marks: marksOf(drawn.marks) }),
    }));
    if (!shooting()) return kept.length === 0 ? undefined : kept;
    doing.textContent = 'Capturing…';
    // Of the first element, which the shot then says the place of; of the page, with none on it.
    const first = onPage(about[0]);
    const of = first ?? document.documentElement;
    const now = await shotOf(shots, of);
    const where = first === undefined ? {} : { box: now.box };
    // The others as the page has them, moved by as much as the shot has the first off where the page has it.
    const live = of.getBoundingClientRect();
    const boxes = about.flatMap((a) => {
      const it = onPage(a);
      if (it === undefined) return [];
      if (it === first) return a.own && options.at !== undefined ? [] : [now.box];
      const r = it.getBoundingClientRect();
      return [{ x: r.left + now.box.x - live.left, y: r.top + now.box.y - live.top, width: r.width, height: r.height }];
    });
    const spot = first !== undefined && about[0]?.own === true ? options.at : undefined;
    const circled = spot === undefined ? undefined : { x: now.box.x + spot.x, y: now.box.y + spot.y };
    if (boxes.length === 0 && circled === undefined) return [{ id: now.id, url: now.url }, ...kept];
    try {
      const { id, url } = await shots.upload(await outlined(now.url, now.size, boxes, circled), now);
      return [{ id, url, ...where, outlined: true }, ...kept];
    } catch {
      return [{ id: now.id, url: now.url, ...where }, ...kept];
    }
  };

  const sendIt = async () => {
    if (sending) return;
    sending = true;
    // A take still going is kept first: it may be all there is to send.
    await speakOff();
    if (text.value.trim() === '' && attachedCount() === 0) {
      sending = false;
      able();
      return;
    }
    able();
    problem.textContent = '';
    note.textContent = '';
    let screenshots: Sent[] | undefined;
    try {
      screenshots = await screenshotsOf();
    } catch (e) {
      // Said under the field, which stays as it is: turn the screenshot off to send without.
      problem.textContent = messageOf(e);
      doing.textContent = '';
      sending = false;
      able();
      return;
    }
    doing.textContent = '';
    const { recordings, voices } = taken();
    const annotations = annotationsOf(notes);
    let done = false;
    try {
      done = await options.submit({
        text: text.value,
        about,
        html: withHtml,
        ...(screenshots === undefined ? {} : { screenshots }),
        recordings,
        voices,
        ...(annotations === undefined ? {} : { annotations }),
      });
    } catch (e) {
      problem.textContent = messageOf(e);
    }
    if (done) {
      text.value = '';
      grow();
      // It has them now: what was made for it, and what was drawn on the page for it.
      for (const plugin of KINDS) tray.remove(plugin);
      notes?.clear();
      wanted = undefined;
      about = options.about?.() ?? [];
      showChips();
      changed();
    }
    sending = false;
    able();
  };

  text.addEventListener('input', () => {
    grow();
    able();
    changed();
  });
  // Enter sends, as a chat's field does; Shift+Enter is a new line. Not while an IME is composing a word.
  text.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    void sendIt();
  });
  showChips();
  requestAnimationFrame(grow);

  return {
    el,
    send,
    problem,
    note,
    pending: () => text.value.trim() !== '' || take !== undefined,
    draft: () => ({ text: text.value, ...(wanted === undefined ? {} : { shot: wanted }), html: withHtml, about }),
    restore: (draft) => {
      if (draft.text !== undefined) text.value = draft.text;
      if (draft.shot !== undefined) wanted = draft.shot;
      if (draft.html !== undefined) withHtml = draft.html;
      if (draft.about !== undefined) about = draft.about;
      showChips();
      grow();
    },
    stopTake: speakOff,
    focus: () => text.focus(),
    destroy: () => {
      for (const stop of unsubscribe) stop?.();
      aborts.abort();
      cancelAnimationFrame(following);
      outlines?.remove();
      // A take it closes on is kept, in the tray: the next one's.
      void speakOff();
    },
  };
}
