/**
 * The Task tab: a field to add a task about the element with. The tasks there already are the drop zone's to list
 * and open (`zone.ts`), and the pins' to show on the page. Beside the channel it says who watches it
 * (`Model.watching`), or that no agent does.
 * Ctrl+Enter or Add sends it with the page's URL, the viewport and the element as it rendered, which
 * the source can't tell: the chain of source it rendered through, its HTML (a file attached), and where the
 * annotations plugin is loaded, what's marked on the page.
 *
 * The field is a composer, as a chat has: what's attached as chips over the words, and under them the buttons that
 * attach, each an icon named by its tooltip, and Add. Two are on or off. With the screenshots plugin, a shot of the
 * page goes with the task as it's added, the element outlined in it (or the spot circled, for a task on one):
 * nothing else says which of two rows alike was meant. And the element's HTML as it rendered, as a file (not with
 * the server half's `html` option off, and then there's no button).
 *
 * The rest make something. Draw takes a shot and opens it to draw on, in the annotations plugin's editor: saved,
 * it's a chip, whose lightbox opens it to change the marks. Record leaves the
 * popup (`away`) to record the page, and comes back with what was typed when it's stopped, wherever the page is by
 * then. Voice records the mic here, its time and waveform beside it.
 *
 * The elements the task is about are attached too, each a chip: the one the popup is on to begin with, and any
 * other the element button's next press on the page picks. Each can be left out again; the first is the task's
 * place, the rest are named beside it, and with none it's about the page.
 *
 * What they make, and what the tool panel's tools made since the last task (the tray), is this one's to attach.
 * Each is a chip, which opens it; removing one takes it out of the tray. With one there, no shot is taken unless
 * it's asked for again.
 *
 * Its tool in the panel adds a task about a spot: picked, the next press on the page opens this tab on that point,
 * in the marked element under it or the nearest to it.
 */
import { componentOf, fiberOf, named, ownerOf, tell } from '#src/client/component.ts';
import { MOD, place, sameAs, targetOf, toolButton } from '#src/client/dom.ts';
import { liveWaveform } from '#src/client/waveform.ts';
import { defineClientPlugin, type LightboxItem, type Point, type Target } from '#src/index.ts';

// For `use()`'s types: the plugins may not be loaded, and nothing of them runs here.
import type { Annotation, Annotations, Picture } from '#src/plugins/annotations/index.ts';
import type { Recording } from '#src/plugins/recordings/index.ts';
import type { Shot } from '#src/plugins/screenshots/index.ts';
import type { Clip, Take } from '#src/plugins/voice/index.ts';

import type { Marks, Model, Op, TaskAdded } from './index.ts';
import { pinsIn } from './pins.ts';
import { storeOf } from './store.ts';
import { zoneOf } from './zone.ts';

const STYLE = `
.compose { flex: none; }
/* One box for what's attached, the words and the buttons, lit as a field is while it's typed in. */
.composer { border: 1px solid var(--deictic-line); border-radius: 12px; background: rgb(0 0 0 / 0.35); }
.composer:focus-within { border-color: var(--deictic-accent); box-shadow: 0 0 0 1px var(--deictic-accent); }
.composer textarea { display: block; min-height: 0; padding: 10px 12px 4px; border: 0; resize: none; background: none; }
.composer textarea:focus { outline: none; }
.composer .chips { margin: 0; padding: 8px 8px 0; }
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
textarea { min-height: 76px; resize: vertical; font: 13px/1.45 system-ui, sans-serif; }
.row { display: flex; gap: 6px; margin-top: 8px; justify-content: space-between; align-items: center; }
/* Cut short before it pushes Add out: a channel's name and its watchers' may be long. */
.hint { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--deictic-muted); font-size: 12px; }
/* A dot as a task's state is: a ring while no one watches, green while someone does. */
.watch::before { content: ''; display: inline-block; box-sizing: border-box; width: 7px; height: 7px; margin-right: 4px; border-radius: 50%; border: 1.5px solid var(--deictic-muted); }
.watch.on::before { border-color: #4ade80; background: #4ade80; }
.hint a { color: inherit; }
.hint a:hover { color: var(--deictic-fg); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; align-items: center; font-size: 12px; }
.chip { display: inline-flex; align-items: center; border: 1px solid var(--deictic-line); border-radius: 6px; }
.chip button { border: 0; }
.chip .open { display: inline-flex; align-items: center; gap: 6px; padding: 2px 4px 2px 2px; }
.chip img { display: block; height: 28px; border-radius: 4px; }
.chip .play { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 4px; background: var(--deictic-line); }
.chip .play svg { width: 12px; height: 12px; }
.chip .play.drawn svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.chip .remove { padding: 0 6px; color: var(--deictic-muted); }
.chip .remove:hover { color: var(--deictic-fg); }
/* An element the task is about: named as the caption names it, in the overlay's own green. */
.chip.about .open { padding: 4px 4px 4px 8px; font: 12px ui-monospace, monospace; color: var(--deictic-accent); }
.chip.about .open span { color: var(--deictic-muted); }
.shot-problem { margin-top: 4px; font-size: 12px; color: var(--deictic-problem); }
.shot-problem:empty { display: none; }
.shot-note { margin-top: 4px; font-size: 12px; color: var(--deictic-muted); }
.shot-note:empty { display: none; }
`;

const TOOL_STYLE = `
.task-tool button { position: relative; }
.task-tool .count {
  position: absolute;
  top: -5px;
  right: -5px;
  box-sizing: border-box;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 8px;
  font: 700 10px/15px system-ui, sans-serif;
  color: var(--deictic-on-accent);
  background: var(--deictic-accent);
}
.task-tool button[aria-pressed='true'] .count { color: var(--deictic-fg); background: #09090b; }
`;
/** A note with a plus: a task to add. */
const TASK = '<path d="M4 5h16v11H9l-5 4zM12 8v5M9.5 10.5h5"/>';

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" fill="currentColor"/></svg>';
/** The composer's buttons, each its strokes on a 24-pixel grid. */
const CAMERA = '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>';
const CODE = '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14"/>';
const PEN = '<path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z"/>';
const RECORD = '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>';
const MIC = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>';
const SEND = '<path d="M12 19V5M6 11l6-6 6 6"/>';
const TARGET = '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>';
/** How tall the field grows with what's typed, in pixels, before it scrolls. */
const GROWN = 200;

/** Marks as a task tells of them: how many, and what the notes say. */
function marksOf(list: readonly Annotation[]): Marks {
  return { count: list.length, notes: list.flatMap(({ shape }) => (shape.kind === 'note' ? [shape.text] : [])) };
}

/** The page's annotations for the op, where there are any. */
function annotationsOf(marks: Annotations | undefined): Pick<Op, 'annotations'> {
  const list = marks?.list() ?? [];
  return list.length === 0 ? {} : { annotations: marksOf(list) };
}

/**
 * A shot as the tray has it: the window's, from the tool panel, or one that was drawn on here. That one's PNG has the
 * marks in it, and it keeps what it was made of, to draw on it again: the shot as taken, the marks, and the element it
 * was taken of (`file:line:column`), as only a task about that element can say where the element is in it.
 */
type Pictured = Shot & { drawn?: { shot: Shot; marks: Annotation[]; about: string } };

/** A shot as the op attaches it, and where it is, for the page to hear of; the op goes without that. */
type Sent = NonNullable<Op['screenshots']>[number] & { url: string };

/** What a task says of an element that only the page with it on knows. */
interface Seen extends Pick<Op, 'point' | 'pointed' | 'count' | 'chain'> {
  /** The element's HTML, as it would be attached. */
  html: string;
}

/**
 * An element the task is about, a chip in the composer: its place, the element where this page has it, and what
 * the page said of it as the panel left for a recording, for a page that no longer has it. `own` is the popup's.
 */
interface About {
  target: Target;
  own: boolean;
  el?: Element;
  seen?: Seen;
}

/** What the panel keeps while it's away recording: what's typed and asked for. What's attached is the tray's. */
interface Kept {
  text: string;
  /** Whether a shot was asked for, or asked not to be, where either was. */
  shot?: boolean;
  html: boolean;
  /** The page as the panel left, and its elements as that page had them: for a task added where the page has moved on. */
  page: string;
  viewport: Op['viewport'];
  about: { target: Target; own: boolean; seen: Seen }[];
}

const atOf = ({ loc }: Target) => `${loc.file}:${loc.line}:${loc.column}`;

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * `#shadow-root > div.panel > div.head > button.tab:nth-of-type(2)`: where `inner` is inside `outer`, through
 * shadow roots, by tag, classes and, among siblings alike, place, for whoever finds it in the code.
 */
function pathTo(inner: Element, outer: Element): string {
  const steps: string[] = [];
  for (let at: Element | undefined = inner; at !== undefined && at !== outer;) {
    const nameOf = (el: Element) => `${el.localName}${[...el.classList].map((c) => `.${c}`).join('')}`;
    const name = nameOf(at);
    const siblings = at.parentElement === null ? [] : [...at.parentElement.children];
    // Its place only where a sibling reads the same.
    const same = siblings.filter((c) => nameOf(c) === name).length > 1;
    const alike = siblings.filter((c) => c.localName === at!.localName);
    steps.unshift(same ? `${name}:nth-of-type(${alike.indexOf(at) + 1})` : name);
    if (at.parentElement !== null) {
      at = at.parentElement;
    } else {
      const root = at.getRootNode();
      if (!(root instanceof ShadowRoot)) break;
      steps.unshift('#shadow-root');
      at = root.host;
    }
  }
  return steps.join(' > ');
}

const parentOf = (el: Element): Element | undefined => {
  if (el.parentElement !== null) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : undefined;
};

/** How many places a chain names after the element's own: who uses it, and who uses that. Further out is the app's shell. */
const CHAIN = 3;

/**
 * The source `el` rendered through, after its own place, nearest first: a shared component's own line is the same
 * wherever it's used, and the change is most often in what uses it, or in what uses that.
 *
 * With React in development, those are the components that wrote it, each the one whose JSX has the one before:
 * `Field (src/Field.tsx:20)`, its line the nearest element around `el` that the component wrote, or the name alone
 * for one with no element of its own around it (it wraps what it uses only in other components), which the marks
 * can't show at all. A layout component the element was only passed through isn't among them.
 *
 * Without (another framework, a production build) it's read off the marks around it, each a `file:line`: the
 * nearest element each next file wrote.
 */
function chainOf(el: Element, file: string): NonNullable<Op['chain']> {
  const found: NonNullable<Op['chain']> = [];
  const wrote = ownerOf(fiberOf(el));
  if (wrote !== undefined) {
    for (let owner = ownerOf(wrote); owner !== undefined && found.length < CHAIN; owner = ownerOf(owner)) {
      const name = componentOf(owner);
      let place: string | undefined;
      for (let at = parentOf(el); at !== undefined && place === undefined; at = parentOf(at)) {
        const by = ownerOf(fiberOf(at));
        // A component's fiber is one of two, by turns: an element may name either.
        if (by === undefined || (by !== owner && by !== owner.alternate)) continue;
        place = at.getAttribute('data-deictic')?.replace(/:\d+$/, '');
      }
      if (name !== undefined) found.push(place === undefined ? name : `${name} (${place})`);
      else if (place !== undefined) found.push(place);
    }
    if (found.length > 0) return found;
  }
  let last = file;
  for (let at = parentOf(el); at !== undefined && found.length < CHAIN; at = parentOf(at)) {
    const mark = at.getAttribute('data-deictic');
    if (mark === null) continue;
    const from = mark.replace(/:\d+:\d+$/, '');
    if (from === last) continue;
    last = from;
    found.push(mark.replace(/:\d+$/, ''));
  }
  return found;
}

/** What's sent of the element's HTML at most, in characters: the server attaches it as a file. */
const HTML = 100_000;

/** The overlay's own green, as its ring on the element while the popup is open. */
const OUTLINE = '#12b358';
/** CSS pixels between the element and its outline, so the dashes are on nothing of the element's. */
const ROOM = 3;

/** How far around a spot its circle is drawn in a shot, in CSS pixels. */
const SPOT = 16;

/**
 * A shot's PNG with what the task is about outlined in it: dashes around each box, with nothing between them, and a
 * circle around `spot`. The shot may have more pixels than its size in CSS ones, which the boxes are in.
 */
async function outlined(png: Blob | string, size: Shot['size'], boxes: Shot['box'][], spot?: Point): Promise<Blob> {
  const url = typeof png === 'string' ? png : URL.createObjectURL(png);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = element('canvas', { width: image.naturalWidth, height: image.naturalHeight });
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error("tasks: this browser won't draw to a canvas");
    ctx.drawImage(image, 0, 0);
    const k = image.naturalWidth / size.width;
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = OUTLINE;
    ctx.setLineDash([6 * k, 4 * k]);
    for (const box of boxes)
      ctx.strokeRect((box.x - ROOM) * k, (box.y - ROOM) * k, (box.width + 2 * ROOM) * k, (box.height + 2 * ROOM) * k);
    if (spot !== undefined) {
      ctx.beginPath();
      ctx.arc(spot.x * k, spot.y * k, SPOT * k, 0, 2 * Math.PI);
      ctx.stroke();
    }
    return await new Promise<Blob>((done, fail) =>
      canvas.toBlob((blob) => (blob === null ? fail(new Error('tasks: the screenshot drew nothing')) : done(blob)), 'image/png'),
    );
  } finally {
    if (typeof png !== 'string') URL.revokeObjectURL(url);
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

/** The event the page hears of each added task by, on `window`: its `detail` is a `TaskAdded`. */
export const TASK_ADDED = 'deictic:task';

/** Tells the page of a task just added: the newest of the element's tasks, as the board answered them. */
function announce(model: Model, op: Op, target: Target, shots: string[]): void {
  const task = model.tasks.at(-1);
  if (task === undefined) return;
  const detail: TaskAdded = {
    id: task.id,
    title: task.title,
    state: task.state,
    channel: model.channel,
    target,
    page: op.page,
    attached: {
      screenshots: op.screenshots?.length ?? 0,
      recordings: op.recordings?.length ?? 0,
      voice: op.voice?.length ?? 0,
      marks: (op.annotations?.count ?? 0) + (op.screenshots ?? []).reduce((n, shot) => n + (shot.marks?.count ?? 0), 0),
    },
    screenshots: shots,
  };
  window.dispatchEvent(new CustomEvent(TASK_ADDED, { detail }));
}

export default defineClientPlugin<Model, Op>({
  name: 'tasks',
  label: 'Task',
  // Its tool in the tool panel, after the others': what takes what they made. Picked, the next press on the page
  // opens the tab on that spot.
  setup: (context) => {
    const { tools, tray } = context;
    // The tasks there already, in the drop zone.
    zoneOf(context);
    const group = element('div', { className: 'tool-group task-tool' });
    let picking = false;
    const button = toolButton(TASK, 'Task', 'T', () => {
      if (picking) return;
      picking = true;
      button.setAttribute('aria-pressed', 'true');
      void tools.pick().then((spot) => {
        picking = false;
        button.setAttribute('aria-pressed', 'false');
        if (spot !== undefined) context.open('tasks', spot.element, spot.at);
      });
    });
    button.setAttribute('aria-pressed', 'false');
    // How much is in the tray, for the task to take.
    const count = element('span', { className: 'count' });
    const counted = () => {
      const held = tray.list().length;
      count.textContent = String(held);
      count.hidden = held === 0;
    };
    tray.subscribe(counted);
    counted();
    button.append(count);
    group.append(element('style', { textContent: TOOL_STYLE }), button);
    tools.add(group, { last: true });
  },
  // What the page before this left the tab for: a recording, where it carries on here.
  resume: ({ use }) => use('recordings')?.going(),
  // The page's tasks, where they are, while it's pointed on.
  pointing: (context) => pinsIn(context).glance(),
  mount: (panel, context) => {
    const style = element('style', { textContent: STYLE });
    const text = element('textarea', { placeholder: 'What should change here?', rows: 2 });
    const hint = element('span', { className: 'hint' });
    const row = element('div', { className: 'row' });
    row.append(hint);
    const compose = element('div', { className: 'compose' });
    panel.append(style, compose);
    // The page's tasks, pinned where they are, while the tab is open too: not for a popup a page shows in place,
    // which is in a root of its own.
    const unpin = panel.getRootNode() === context.root ? pinsIn(context).glance() : undefined;

    const shots = context.use('screenshots');
    const notes = context.use('annotations');
    const recorder = context.use('recordings');
    const voice = context.use('voice');
    const { tray } = context;
    const back = context.resumed;
    // Back from a recording on a page without the element: nothing of it to shoot or read here.
    const here = context.element.isConnected;
    // The server half's `html` option, which takes the button away; a page half with no options (a `standalone` server's) has it.
    const sendsHtml = (context.options as { html?: boolean } | undefined)?.html !== false;

    // What the task is about, in the order attached: the popup's own element to begin with.
    let about: About[] = [{ target: context.target, own: true, el: context.element }];
    const onPage = (a: About | undefined): Element | undefined => (a?.el?.isConnected === true ? a.el : undefined);

    // A shot as the task goes: said (on, or off), or else only while nothing else is attached, which says it.
    let wanted: boolean | undefined;
    const shooting = () => shots !== undefined && here && (wanted ?? attachedCount() === 0);
    let withHtml = true;

    const chipsEl = element('div', { className: 'chips' });
    const camera = toolButton(CAMERA, 'Attach a screenshot, taken as the task is added', undefined, () => {
      wanted = !shooting();
      showChips();
    });
    camera.hidden = shots === undefined || !here;
    const code = toolButton(CODE, 'Attach an HTML snapshot: the element as the page has it now, as a file', undefined, () => {
      withHtml = !withHtml;
      showChips();
    });
    code.hidden = !sendsHtml;
    const picker = toolButton(TARGET, 'Attach another element: press it on the page', undefined, () => void pick());
    picker.setAttribute('aria-pressed', 'false');
    // Not in a popup a page shows in place: there's no page under it to press on.
    picker.hidden = panel.getRootNode() !== context.root;
    const pen = toolButton(PEN, 'Draw on a screenshot', undefined, () => void draw());
    pen.hidden = shots === undefined || notes === undefined || !here;
    const record = toolButton(RECORD, 'Record the page, and come back here', undefined, () => void leave());
    record.hidden = recorder === undefined;
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
    // What Add waits on, while it does: a shot being taken.
    const doing = element('span', { className: 'doing' });
    const add = toolButton(SEND, 'Add task', `${MOD}+Enter`, () => void send());
    add.classList.add('send', 'primary');
    const attach = element('div', { className: 'attach' });
    attach.append(camera, code, gap, picker, pen, record, mic, hearing, doing, add);
    const composer = element('div', { className: 'composer' });
    composer.append(chipsEl, text, attach);
    const problem = element('div', { className: 'shot-problem' });
    // What a task that this tab doesn't list says of itself, once it's added.
    const note = element('div', { className: 'shot-note' });
    compose.append(composer, problem, note, row);
    // As tall as what's typed, to a point: the popup has the rest of the window for the tasks.
    const grow = () => {
      text.style.height = 'auto';
      text.style.height = `${Math.min(text.scrollHeight, GROWN)}px`;
    };

    // What the tool panel's tools made and no task has taken: this one's to attach, as each plugin said it.
    const inTray = <T>(plugin: string) => tray.list(plugin).map((item) => item.value as T);
    const taken = () => ({
      shots: inTray<Pictured>('screenshots'),
      recordings: inTray<Recording>('recordings'),
      voices: inTray<Clip>('voice'),
    });
    const KINDS = ['screenshots', 'recordings', 'voice'];
    const attachedCount = () => KINDS.reduce((n, plugin) => n + tray.list(plugin).length, 0);
    // A task goes with words, or with something attached that says it; not while one is going.
    let sending = false;
    const able = () => (add.disabled = sending || (text.value.trim() === '' && attachedCount() === 0 && take === undefined));
    const chip = (content: (string | Node)[], title: string, at: number, remove: string, drop: () => void) => {
      const opener = element('button', { type: 'button', className: 'open', title });
      opener.append(...content);
      // Every attachment in one lightbox, opened at this one, growing out of its chip.
      opener.addEventListener('click', () => context.lightbox(viewed(), { at, from: el }));
      const remover = element('button', { type: 'button', className: 'remove', textContent: '×', title: remove });
      remover.addEventListener('click', drop);
      const el = element('span', { className: 'chip' });
      el.append(opener, remover);
      return el;
    };
    const numbered = (name: string, i: number, of: number) => (of === 1 ? name : `${name} ${i + 1}`);
    /** What's attached, as the lightbox shows it, in the chips' order. */
    const viewed = (): LightboxItem[] => {
      const { shots: pictures, recordings, voices } = taken();
      return [
        ...pictures.map((s, i) => ({
          kind: 'image' as const,
          url: s.url,
          title: numbered('Screenshot', i, pictures.length),
          ...(s.drawn === undefined ? {} : { actions: [{ label: 'Change marks', title: 'Draw on it again', run: () => void draw(s) }] }),
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
    const showChips = () => {
      const { shots: pictures, recordings, voices } = taken();
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
    /** An element the task is about: named as the caption names it, with its place for a tip. Its chip shows it, and its × leaves it out. */
    const aboutChip = (a: About) => {
      const el = onPage(a);
      const { file, line } = a.target.loc;
      const { component, sole, tag } = el === undefined ? { component: undefined, sole: false, tag: a.target.tag } : named(el);
      const opener = element('button', { type: 'button', className: 'open', title: `${file}:${line}` });
      opener.append(`<${component ?? tag}>`, ...(component === undefined || sole ? [] : [element('span', { textContent: ` <${tag}>` })]));
      opener.addEventListener('click', () => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      const name = el === undefined ? `<${tag}>` : tell(named(el));
      const remover = element('button', { type: 'button', className: 'remove', textContent: '×', title: `Leave ${name} out` });
      remover.addEventListener('click', () => {
        about = about.filter((x) => x !== a);
        showChips();
      });
      const chip = element('span', { className: 'chip about' });
      chip.append(opener, remover);
      return chip;
    };
    /** What's drawn on the page, which goes with the task: its chip draws more, and its × clears it. */
    const marksChip = (marked: number) => {
      const opener = element('button', { type: 'button', className: 'open', title: 'Draw more on the page' });
      const icon = element('span', { className: 'play drawn', innerHTML: `<svg viewBox="0 0 24 24" aria-hidden="true">${PEN}</svg>` });
      opener.append(icon, `${marked} mark${marked === 1 ? '' : 's'}`);
      opener.addEventListener('click', () => notes?.draw());
      const remover = element('button', { type: 'button', className: 'remove', textContent: '×', title: 'Clear the marks' });
      remover.addEventListener('click', () => notes?.clear());
      const el = element('span', { className: 'chip' });
      el.append(opener, remover);
      return el;
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
    const outlines = panel.getRootNode() === context.root ? element('div') : undefined;
    if (outlines !== undefined) context.root.append(outlines);
    let following = 0;
    const follow = () => {
      following = requestAnimationFrame(follow);
      if (outlines === undefined) return;
      const others = about.flatMap((a) => (a.own || onPage(a) === undefined ? [] : [onPage(a)!]));
      while (outlines.childElementCount > others.length) outlines.lastElementChild!.remove();
      while (outlines.childElementCount < others.length) outlines.append(element('div', { className: 'task-about' }));
      for (const [i, el] of others.entries()) place(outlines.children[i] as HTMLElement, el.getBoundingClientRect());
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
        const shot = old?.drawn?.shot ?? (await shots.capture(onPage(about[0]) ?? document.documentElement));
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

    // Record: the popup goes, the page is recorded, and it comes back with what's typed and the recording attached.
    const leave = async () => {
      if (recorder === undefined || sending) return;
      problem.textContent = '';
      if (recorder.recording()) {
        problem.textContent = "A recording is going already: stop it in the tool panel, and it's attached here";
        return;
      }
      // A take going on is kept first, as a chip, to come back to with the rest.
      await speakOff();
      const kept: Kept = {
        text: text.value,
        ...(wanted === undefined ? {} : { shot: wanted }),
        html: withHtml,
        ...wherever(),
        about: about.flatMap(({ target, own, ...a }) => {
          const seen = seenOf({ target, own, ...a });
          return seen === undefined ? [] : [{ target, own, seen }];
        }),
      };
      context.away(kept, () => recorder.record());
    };

    // The mic, here: its button starts a take, and stops it, and it's a chip.
    let take: Take | undefined;
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
      mark();
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
      mark();
    };

    /** Tells the popup what leaving now would lose: the words of a new task, or a take. What's attached is the tray's, and stays. */
    const mark = () => context.unsaved(text.value.trim() === '' && take === undefined ? undefined : add);
    /** Where a task goes, and whether it's taken up: the channel, and who watches it, or that no one does, where that's known. */
    const render = ({ channel, link, watching }: Model) => {
      const name =
        link === undefined
          ? element('span')
          : element('a', { href: link, target: '_blank', rel: 'noreferrer', title: 'Open the channel on the board' });
      name.textContent = `#${channel}`;
      hint.replaceChildren('to ', name);
      if (watching === undefined) return;
      const names = new Intl.ListFormat('en', { type: 'conjunction' }).format(watching);
      const on = watching.length > 0;
      const who = element('span', {
        className: on ? 'watch on' : 'watch',
        textContent: on ? `${names} watching` : 'no agent watching',
        title: on
          ? `${names} ${watching.length === 1 ? 'is' : 'are'} watching #${channel}, and take${watching.length === 1 ? 's' : ''} each task as it's added`
          : `A task waits on the board until an agent watches #${channel}: ask yours to watch deictic's tasks`,
      });
      hint.append(' · ', who);
    };

    /**
     * What the page says of an element: read now, while the page has it, and as the panel left it where the page
     * has moved on without it (a recording that went on to another), which is the page the task is about.
     */
    const seenOf = (a: About): Seen | undefined => {
      const el = onPage(a);
      if (el === undefined) return a.seen;
      const chain = chainOf(el, a.target.loc.file);
      const { pointed, at } = context;
      return {
        // What was pointed at, and the spot, are the popup's own element's.
        ...(a.own && at !== undefined ? { point: at } : {}),
        ...(a.own && pointed !== undefined ? { pointed: { path: pathTo(pointed, el), html: pointed.outerHTML.slice(0, 4000) } } : {}),
        count: sameAs(el).length,
        ...(chain.length === 0 ? {} : { chain }),
        html: (shots?.masked(el) ?? el).outerHTML.slice(0, HTML),
      };
    };
    /** The page the task is about: this one, or the one the panel left where none of its elements is on this one. */
    const wherever = (): Pick<Kept, 'page' | 'viewport'> => {
      if (back !== undefined && about.length > 0 && !about.some((a) => onPage(a) !== undefined)) {
        const { page, viewport } = back.state as Kept;
        return { page, viewport };
      }
      return { page: location.href, viewport: { width: innerWidth, height: innerHeight } };
    };

    /**
     * The shots to attach: one taken now, where that's on, and those in the tray, each the window as it was taken.
     * Only the first has the task's elements outlined in it, and its spot circled (or is as it was taken, where
     * that can't be drawn), so it's first: nothing else in a shot says what the task is about.
     */
    const screenshotsOf = async (): Promise<Sent[] | undefined> => {
      if (shots === undefined) return undefined;
      // One drawn on says its notes, and where the element is in it, where it's the task's first it was taken of.
      const kept: Sent[] = taken().shots.map(({ id, url, drawn }) => ({
        id,
        url,
        ...(drawn !== undefined && drawn.about === firstAt() ? { box: drawn.shot.box } : {}),
        ...(drawn === undefined || drawn.marks.length === 0 ? {} : { marks: marksOf(drawn.marks) }),
      }));
      if (!shooting()) return kept.length === 0 ? undefined : kept;
      doing.textContent = 'Capturing…';
      // Of the task's first element, which the shot then says the place of; of the page, with none on it.
      const first = onPage(about[0]);
      const of = first ?? document.documentElement;
      const now = await shots.capture(of);
      const box = first === undefined ? {} : { box: now.box };
      // The others as the page has them, moved by as much as the shot has the first off where the page has it.
      const live = of.getBoundingClientRect();
      const boxes = about.flatMap((a) => {
        const el = onPage(a);
        if (el === undefined) return [];
        if (el === first) return a.own && context.at !== undefined ? [] : [now.box];
        const r = el.getBoundingClientRect();
        return [{ x: r.left + now.box.x - live.left, y: r.top + now.box.y - live.top, width: r.width, height: r.height }];
      });
      const spot = first !== undefined && about[0]?.own === true ? context.at : undefined;
      const circled = spot === undefined ? undefined : { x: now.box.x + spot.x, y: now.box.y + spot.y };
      if (boxes.length === 0 && circled === undefined) return [{ id: now.id, url: now.url }, ...kept];
      try {
        const { id, url } = await shots.upload(await outlined(now.url, now.size, boxes, circled), now);
        return [{ id, url, ...box, outlined: true }, ...kept];
      } catch {
        return [{ id: now.id, url: now.url, ...box }, ...kept];
      }
    };

    const send = async () => {
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
      try {
        const { recordings, voices } = taken();
        // The first element is the task's place; the rest are named beside it; with none, it's the page's.
        const [first, ...rest] = about;
        const { html, ...said } = (first === undefined ? undefined : seenOf(first)) ?? { html: undefined, count: 0 };
        const htmlOf = (of: string | undefined) => (sendsHtml && withHtml && of !== undefined ? { html: of } : {});
        const op: Op = {
          text: text.value,
          ...wherever(),
          ...said,
          ...(first === undefined ? { detached: true } : {}),
          ...htmlOf(html),
          ...(rest.length === 0 ? {} : { also: rest.map((a) => ({ at: atOf(a.target), tag: a.target.tag, ...htmlOf(seenOf(a)?.html) })) }),
          ...(screenshots === undefined ? {} : { screenshots: screenshots.map(({ url: _, ...taken }) => taken) }),
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
          ...annotationsOf(notes),
        };
        // Sent on its first element, which may not be the popup's: then the tasks answered are that one's, not
        // this tab's to list.
        const on = first?.target ?? context.target;
        const model = await context.apply(op, on);
        // In the drop zone and on its pin at once: the tab lists none.
        storeOf(context).load(true);
        announce(
          model,
          op,
          on,
          (screenshots ?? []).map((taken) => taken.url),
        );
        const added = model.tasks.at(-1)?.id;
        note.textContent =
          first === undefined
            ? 'Added, about the page: it is in the drop zone'
            : `Added${added === undefined ? '' : ` #${added}`}: it is in the drop zone`;
        text.value = '';
        grow();
        // The task has them now: what was made for it, and what was drawn on the page for it.
        for (const plugin of KINDS) tray.remove(plugin);
        notes?.clear();
        wanted = undefined;
        // About the popup's own element again, as it opened.
        about = [{ target: context.target, own: true, el: context.element }];
        showChips();
        mark();
        const dropped = model.tasks.at(-1)?.dropped;
        if (dropped !== undefined) problem.textContent = `Sent without ${dropped}: it wasn't kept any more`;
      } catch {
        // The panel's status says why; what was typed and attached stays, to send again.
      }
      sending = false;
      able();
    };

    // Back from recording: what was typed and asked for, and why there's no recording, where there's none.
    if (back !== undefined) {
      const kept = back.state as Kept;
      text.value = kept.text;
      wanted = kept.shot;
      withHtml = kept.html;
      // Each element where this page has it, and as the page that had it said it where not.
      about = kept.about.map(({ target, own, seen }) => {
        const el = own ? context.element : (document.querySelector(`[data-deictic="${CSS.escape(atOf(target))}"]`) ?? undefined);
        return { target, own, seen, ...(el === undefined ? {} : { el }) };
      });
      if (back.problem !== undefined) problem.textContent = back.problem;
    }

    text.addEventListener('input', () => {
      grow();
      able();
      mark();
    });
    text.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      void send();
    });
    showChips();
    render(context.model);
    grow();
    text.focus();
    return () => {
      unpin?.();
      for (const stop of unsubscribe) stop?.();
      aborts.abort();
      cancelAnimationFrame(following);
      outlines?.remove();
      // A take the popup closes on is kept, in the tray: the next task's.
      void speakOff();
    };
  },
});
