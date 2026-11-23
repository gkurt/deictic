/**
 * The tasks panel: the tasks already about this element and their state, and a field to add one. Each
 * task's ID opens it on the board, where the board has a page; one no one has claimed yet can be edited
 * in place (its words) or deleted (canceled on the board), both changes the popup's undo takes back.
 * Beside the channel it says who watches it (`Model.watching`), or that no agent does.
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
 * What they make, and what the tool panel's tools made since the last task (the tray), is this one's to attach.
 * Each is a chip, which opens it; removing one takes it out of the tray. With one there, no shot is taken unless
 * it's asked for again.
 *
 * Its tool in the panel adds a task about a spot: picked, the next press on the page opens this tab on that point,
 * in the marked element under it or the nearest to it.
 */
import { MOD, toolButton } from '#src/client/dom.ts';
import { liveWaveform } from '#src/client/waveform.ts';
import { defineClientPlugin, type LightboxItem, type Point, type Target } from '#src/index.ts';

// For `use()`'s types: the plugins may not be loaded, and nothing of them runs here.
import type { Annotation, Annotations, Picture } from '#src/plugins/annotations/index.ts';
import type { Recording } from '#src/plugins/recordings/index.ts';
import type { Shot } from '#src/plugins/screenshots/index.ts';
import type { Clip, Take } from '#src/plugins/voice/index.ts';

import type { Change, Marks, Model, Op, Task, TaskAdded } from './index.ts';
import { pinsIn } from './pins.ts';

const STYLE = `
/*
 * The panel has the window's height, so the tasks aren't a few lines of a list: each is a card that says its state
 * and reads whole, and they scroll over the field, which stays where it is.
 */
.body:has(> .thread) { display: flex; flex-direction: column; }
.thread { flex: 0 1 auto; min-height: 0; margin: -12px -12px 0; padding: 12px 12px 0; overflow-y: auto; scrollbar-width: thin; }
/* Never squeezed out by the field: a window too low for both scrolls the panel. */
.thread:has(> .tasks li, .more[open] li) { min-height: 84px; }
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
/* The column is no wider than the panel: an \`auto\` one grows to a long word, which then never wraps. */
.tasks { list-style: none; margin: 0 0 10px; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.tasks:empty { margin: 0; }
.tasks li {
  display: grid;
  grid-template: 'state says place acts id' auto 'text text text text text' auto / auto minmax(0, 1fr) auto auto auto;
  gap: 6px 8px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid rgb(255 255 255 / 0.08);
  border-radius: 10px;
  background: rgb(255 255 255 / 0.04);
}
.tasks li:hover, .tasks li:focus-within { border-color: rgb(255 255 255 / 0.16); background: rgb(255 255 255 / 0.06); }
/* The state is a dot and its name: a ring while no one has it, filled once someone does or it's over. */
.tasks .state { grid-area: state; box-sizing: border-box; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--deictic-muted); }
.tasks .state.waiting { border-style: dotted; }
.tasks .state.claimed { border-color: #60a5fa; background: #60a5fa; }
.tasks .state.blocked { border-color: #fbbf24; background: #fbbf24; }
.tasks .state.completed { border-color: #4ade80; background: #4ade80; }
.tasks .state.failed { border-color: var(--deictic-problem); background: var(--deictic-problem); }
.tasks .says { grid-area: says; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--deictic-muted); }
.tasks .says.claimed { color: #60a5fa; }
.tasks .says.blocked { color: #fbbf24; }
.tasks .says.completed { color: #4ade80; }
.tasks .says.failed { color: var(--deictic-problem); }
.tasks a { color: inherit; text-decoration: none; }
.tasks a:hover { text-decoration: underline; }
.tasks li > a, .tasks li > code { grid-area: id; color: var(--deictic-muted); }
.tasks .place { grid-area: place; padding: 0; border: 0; font: 11px ui-monospace, monospace; color: var(--deictic-muted); }
.tasks button.place:hover { color: var(--deictic-fg); text-decoration: underline; }
.tasks .title { grid-area: text; padding: 0; border: 0; border-radius: 0; text-align: left; font-size: 13px; line-height: 1.45; }
/* A few lines of it, as it was typed, and all of it once clicked. */
.tasks .title span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; }
.tasks li.whole .title span { display: block; }
/* In the card's first line: there all along, and plain once the card is pointed at or focused in. */
.tasks .acts { grid-area: acts; display: flex; opacity: 0; }
.tasks li:hover .acts, .tasks li:focus-within .acts { opacity: 1; }
.tasks .act { display: inline-flex; padding: 2px; border: 0; color: var(--deictic-muted); }
.tasks .act:hover { color: var(--deictic-fg); }
.tasks .act svg { width: 12px; height: 12px; }
.more { margin: 0 0 10px; }
.more[hidden] { display: none; }
.more summary { cursor: pointer; font-size: 12px; color: var(--deictic-muted); }
.more summary:hover { color: var(--deictic-fg); }
.more .tasks { margin: 8px 0 0; }
.tasks li.editing { grid-template: none / minmax(0, 1fr); }
.tasks li.editing .row { margin-top: 0; }
.tasks li.editing .actions { display: flex; gap: 6px; }
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
.shot-problem { margin-top: 4px; font-size: 12px; color: var(--deictic-problem); }
.shot-problem:empty { display: none; }
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

const ICON = (path: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
const EDIT = ICON('M4 20h4L19 9l-4-4L4 16z');
const DELETE = ICON('M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13');
/** The states of a task that's over, as a board names them: nothing more happens to it. */
const OVER = new Set(['completed', 'failed']);
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" fill="currentColor"/></svg>';
/** The composer's buttons, each its strokes on a 24-pixel grid. */
const CAMERA = '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>';
const CODE = '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14"/>';
const PEN = '<path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z"/>';
const RECORD = '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>';
const MIC = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>';
const SEND = '<path d="M12 19V5M6 11l6-6 6 6"/>';
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

/** What a task says that only the page with the element on it knows. */
type Facts = Pick<Op, 'page' | 'viewport' | 'point' | 'pointed' | 'count' | 'chain'> & {
  /** The element's HTML, as it would be attached. */
  html: string;
};

/** What the panel keeps while it's away recording: what's typed and asked for. What's attached is the tray's. */
interface Kept {
  text: string;
  /** Whether a shot was asked for, or asked not to be, where either was. */
  shot?: boolean;
  html: boolean;
  /** What the page said of the element as the panel left, for a task added where the page no longer has it. */
  facts: Facts;
}

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
 * What React keeps, in development, of who wrote an element: a fiber (its `type` the component), or for a server
 * component its `name`. Each has the one that wrote it in turn.
 */
interface Owner {
  name?: unknown;
  type?: unknown;
  alternate?: Owner | null;
  owner?: Owner | null;
  _debugOwner?: Owner | null;
}

/** React's fiber of an element it rendered, which it keeps on the element under a key of its own. */
const fiberOf = (el: Element): Owner | undefined => {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  return key === undefined ? undefined : (el as unknown as Record<string, Owner>)[key];
};

const ownerOf = (of: Owner | undefined): Owner | undefined => of?._debugOwner ?? of?.owner ?? undefined;

/** A component's name, through `memo` and `forwardRef`, or nothing for one written without. */
function componentOf(owner: Owner): string | undefined {
  if (typeof owner.name === 'string') return owner.name === '' ? undefined : owner.name;
  let type = owner.type as { displayName?: unknown; name?: unknown; render?: unknown; type?: unknown } | null | undefined;
  for (let depth = 0; depth < 4 && type !== null && type !== undefined; depth++) {
    // A function's own name, where it has no `displayName`; a `memo` or `forwardRef` object has neither.
    const name = type.displayName ?? type.name;
    if (typeof name === 'string' && name !== '') return name;
    type = (type.render ?? type.type) as typeof type;
  }
  return undefined;
}

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
 * A shot's PNG with the element outlined in it: dashes around its box, with nothing between them. With `at`, a spot
 * in the element, it's the spot that's circled. The shot may have more pixels than its size in CSS ones, which the
 * box is in.
 */
async function outlined(png: Blob | string, { box, size }: Pick<Shot, 'box' | 'size'>, at?: Point): Promise<Blob> {
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
    const rect = [(box.x - ROOM) * k, (box.y - ROOM) * k, (box.width + 2 * ROOM) * k, (box.height + 2 * ROOM) * k] as const;
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = OUTLINE;
    ctx.setLineDash([6 * k, 4 * k]);
    if (at === undefined) {
      ctx.strokeRect(...rect);
    } else {
      ctx.beginPath();
      ctx.arc((box.x + at.x) * k, (box.y + at.y) * k, SPOT * k, 0, 2 * Math.PI);
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

export default defineClientPlugin<Model, Change>({
  name: 'tasks',
  label: 'Task',
  // Its tool in the tool panel, after the others': what takes what they made. Picked, the next press on the page
  // opens the tab on that spot.
  setup: (context) => {
    const { tools, tray } = context;
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
    const list = element('ul', { className: 'tasks' });
    const text = element('textarea', { placeholder: 'What should change here?', rows: 2 });
    const hint = element('span', { className: 'hint' });
    const row = element('div', { className: 'row' });
    row.append(hint);
    // The file's other tasks, folded away: the panel is about this element. It stays as it's left while the panel is up.
    const fold = element('details', { className: 'more' });
    const count = element('summary');
    const others = element('ul', { className: 'tasks' });
    fold.append(count, others);
    // The element's tasks that are over, folded away too: what's still to do is what's read first.
    const closed = element('details', { className: 'more' });
    const closedCount = element('summary');
    const ended = element('ul', { className: 'tasks' });
    closed.append(closedCount, ended);
    // What's there, and what's being added: apart, as the one scrolls over the other.
    const thread = element('div', { className: 'thread' });
    thread.append(list, closed, fold);
    const compose = element('div', { className: 'compose' });
    panel.append(style, thread, compose);
    // The page's other tasks, pinned where they are: not for a popup a page shows in place, which is in a root of
    // its own.
    const around = panel.getRootNode() === context.root ? pinsIn(context).around(context.element) : undefined;

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
      hidden: (camera.hidden && code.hidden) || (pen.hidden && record.hidden && mic.hidden),
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
    attach.append(camera, code, gap, pen, record, mic, hearing, doing, add);
    const composer = element('div', { className: 'composer' });
    composer.append(chipsEl, text, attach);
    const problem = element('div', { className: 'shot-problem' });
    compose.append(composer, problem, row);
    // As tall as what's typed, to a point: the popup has the rest of the window for the tasks.
    const grow = () => {
      text.style.height = 'auto';
      text.style.height = `${Math.min(text.scrollHeight, GROWN)}px`;
    };

    // What the tool panel's tools made and no task has taken: this one's to attach, as each plugin said it.
    const held = <T>(plugin: string) => tray.list(plugin).map((item) => item.value as T);
    const taken = () => ({ shots: held<Pictured>('screenshots'), recordings: held<Recording>('recordings'), voices: held<Clip>('voice') });
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
    const named = (name: string, i: number, of: number) => (of === 1 ? name : `${name} ${i + 1}`);
    /** What's attached, as the lightbox shows it, in the chips' order. */
    const viewed = (): LightboxItem[] => {
      const { shots: pictures, recordings, voices } = taken();
      return [
        ...pictures.map((s, i) => ({
          kind: 'image' as const,
          url: s.url,
          title: named('Screenshot', i, pictures.length),
          ...(s.drawn === undefined ? {} : { actions: [{ label: 'Change marks', title: 'Draw on it again', run: () => void draw(s) }] }),
        })),
        ...recordings.map((r, i) => ({
          kind: 'page' as const,
          // The replay filling the frame, without a header of its own: the lightbox names it.
          url: `${r.url}${r.url.includes('?') ? '&' : '?'}embed`,
          title: `${named('Recording', i, recordings.length)} · ${clock(r.duration)}`,
          actions: [
            { label: 'New tab', title: 'Play it back in a tab of its own', run: () => void window.open(r.url, '_blank', 'noopener') },
          ],
        })),
        ...voices.map((v, i) => ({
          kind: 'audio' as const,
          url: v.url,
          title: `${named('Voice', i, voices.length)} · ${clock(v.duration)}`,
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
      chipsEl.hidden = attachedCount() === 0 && marked === 0;
      chipsEl.replaceChildren(
        ...pictures.map((s, i) => {
          const name = named('Screenshot', i, pictures.length);
          const thumb = element('img', { src: s.url, alt: '' });
          return chip([thumb, name], `Open ${name.toLowerCase()}`, i, `Remove ${name.toLowerCase()}`, drop('screenshots', s.id));
        }),
        ...recordings.map((r, i) => {
          const name = named('Recording', i, recordings.length);
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
          const name = named('Voice', i, voices.length);
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

    // Draw: a shot is taken and opened to draw on, or a chip's opened again. Saved, the PNG of both is kept as a
    // shot of its own, in the tray, so it's a chip as any other is.
    const { file, line, column } = context.target.loc;
    const place = `${file}:${line}:${column}`;
    const aborts = new AbortController();
    let drawing = false;
    const draw = async (old?: Pictured) => {
      if (shots === undefined || notes === undefined || drawing || sending) return;
      drawing = true;
      problem.textContent = '';
      try {
        if (old === undefined) doing.textContent = 'Capturing…';
        const shot = old?.drawn?.shot ?? (await shots.capture(context.element));
        doing.textContent = '';
        const picture: Picture = { url: shot.url, ...shot.size };
        const marks = await notes.edit(picture, old?.drawn?.marks ?? [], { signal: aborts.signal });
        if (marks === undefined) return;
        doing.textContent = 'Saving…';
        const kept = await shots.upload(await notes.flatten(picture, marks), shot);
        if (old !== undefined) tray.remove('screenshots', old.id);
        const pictured: Pictured = { ...kept, drawn: { shot, marks, about: old?.drawn?.about ?? place } };
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
      const kept: Kept = { text: text.value, ...(wanted === undefined ? {} : { shot: wanted }), html: withHtml, facts: facts() };
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

    // The task whose words are open to change, by ID, and the tasks as last read.
    let editing: string | undefined;
    // The tasks shown whole, by ID: kept over a change, which draws the list again.
    const whole = new Set<string>();
    // The Save of a listed task whose words were changed and not kept yet.
    let edited: HTMLElement | undefined;
    /** Tells the popup what leaving now would lose: a listed task's changed words, a new one's, or a take. What's attached is the tray's, and stays. */
    const mark = () => context.unsaved(edited ?? (text.value.trim() === '' && take === undefined ? undefined : add));
    let shown = context.model;
    /** Asks for a change to a listed task and shows the tasks as they are after; the panel's status says why not. */
    const change = async (op: Change) => {
      try {
        editing = undefined;
        render(await context.apply(op));
        around?.refresh();
      } catch {
        render(shown);
      }
    };
    /** A task's words in a field of their own: Save or Ctrl+Enter keeps them, Cancel or Esc leaves them. */
    const editor = (t: Task) => {
      // Marked a modal while it's open, so Esc is its and not the popup's.
      const item = element('li', { className: 'editing' });
      item.dataset['deicticModal'] = '';
      const field = element('textarea', { value: t.text });
      const save = element('button', { type: 'button', className: 'primary', textContent: 'Save' });
      const leave = element('button', { type: 'button', textContent: 'Cancel' });
      const buttons = element('div', { className: 'row' });
      const right = element('span', { className: 'actions' });
      right.append(leave, save);
      buttons.append(element('code', { textContent: `#${t.id}` }), right);
      item.append(field, buttons);
      const done = () => {
        editing = undefined;
        render(shown);
      };
      const keep = () => {
        if (field.value.trim() === '') return;
        if (field.value.trim() === t.text) return done();
        save.disabled = true;
        void change({ edit: t.id, text: field.value });
      };
      field.addEventListener('input', () => {
        save.disabled = field.value.trim() === '';
        edited = field.value.trim() === t.text ? undefined : save;
        mark();
      });
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          done();
        }
        if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        keep();
      });
      save.addEventListener('click', keep);
      leave.addEventListener('click', done);
      queueMicrotask(() => field.focus());
      return item;
    };
    const render = (model: Model) => {
      shown = model;
      // A task being changed is drawn again with its words as they were.
      edited = undefined;
      const { channel, link, tasks, elsewhere, watching } = model;
      const name =
        link === undefined
          ? element('span')
          : element('a', { href: link, target: '_blank', rel: 'noreferrer', title: 'Open the channel on the board' });
      name.textContent = `#${channel}`;
      hint.replaceChildren('to ', name);
      // Whether a task added now is taken up: who watches the channel, or that no one does, where that's known.
      if (watching !== undefined) {
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
      }
      /** A task's card: its state, its ID, a link where it has a page, its words, and where it's from when that's said. */
      const rowOf = (t: Task, from?: HTMLElement) => {
        const item = element('li');
        const says = t.by === undefined ? t.state : `${t.state} by ${t.by}`;
        // The dot is the words beside it again, in a colour: nothing to read out.
        const state = element('span', { className: `state ${t.state}`, ariaHidden: 'true' });
        const said = element('span', { className: `says ${t.state}`, textContent: says });
        const id = element('code', { textContent: `#${t.id}` });
        const title = element('button', { type: 'button', className: 'title' });
        // In a box of its own: a button's doesn't cut its lines short.
        title.append(element('span', { textContent: t.text }));
        // In place, not by drawing the list again: that would take a task's words being changed with it.
        const show = () => {
          const all = whole.has(t.id);
          item.classList.toggle('whole', all);
          title.title = all ? 'Show less of it' : 'Show all of it';
          title.ariaExpanded = String(all);
        };
        title.addEventListener('click', () => {
          if (!whole.delete(t.id)) whole.add(t.id);
          show();
        });
        show();
        const to =
          t.link === undefined
            ? id
            : element('a', { href: t.link, target: '_blank', rel: 'noreferrer', title: 'Open the task on the board' });
        if (to !== id) to.append(id);
        item.append(state, said, to, title, ...(from === undefined ? [] : [from]));
        return item;
      };
      const { file } = context.target.loc;
      fold.hidden = elsewhere.length === 0;
      count.textContent = `${elsewhere.length} elsewhere in ${file.split('/').at(-1)}`;
      others.replaceChildren(
        ...elsewhere.map((t) => {
          if (t.at === undefined) return rowOf(t);
          const { line, column, tag } = t.at;
          const name = `<${tag}> :${line}`;
          // Only an element the page shows now has a popup to open: its place is from the task, which may be old.
          const there = document.querySelector(`[data-deictic="${CSS.escape(`${file}:${line}:${column}`)}"]`);
          if (there === null)
            return rowOf(t, element('span', { className: 'place', textContent: name, title: `Line ${line}, not on this page now` }));

          const go = element('button', { type: 'button', className: 'place', textContent: name, title: `Open the tasks of line ${line}` });
          go.addEventListener('click', () => void context.open('tasks', there));
          return rowOf(t, go);
        }),
      );
      const over = tasks.filter((t) => OVER.has(t.state));
      closed.hidden = over.length === 0;
      closedCount.textContent = `${over.length} closed`;
      ended.replaceChildren(...over.map((t) => rowOf(t)));
      const live = tasks.filter((t) => !OVER.has(t.state));
      // The latest is the last, which a list longer than its room would keep out of sight: as it opens, and after one is added.
      const grew = live.length > list.childElementCount;
      list.replaceChildren(
        ...live.map((t) => {
          if (t.id === editing && t.open) return editor(t);
          const item = rowOf(
            t,
            t.at === undefined
              ? undefined
              : element('span', {
                  className: 'place',
                  textContent: `was :${t.at.line}`,
                  title: `Added when this was on line ${t.at.line}: it has moved since`,
                }),
          );
          if (!t.open) return item;
          const edit = element('button', { type: 'button', className: 'act', innerHTML: EDIT, title: 'Edit the task' });
          edit.addEventListener('click', () => {
            editing = t.id;
            render(shown);
          });
          const remove = element('button', { type: 'button', className: 'act', innerHTML: DELETE, title: 'Delete the task' });
          remove.addEventListener('click', () => {
            remove.disabled = true;
            void change({ remove: t.id });
          });
          const acts = element('span', { className: 'acts' });
          acts.append(edit, remove);
          item.append(acts);
          return item;
        }),
      );
      if (grew) thread.scrollTop = thread.scrollHeight;
      able();
      mark();
    };

    /**
     * What the page says of the element: read now, while the page has it, and as the panel left it where the
     * page has moved on without it (a recording that went on to another), which is the page the task is about.
     */
    const facts = (): Facts => {
      const { element: el, elements, pointed, at } = context;
      if (!here && back !== undefined) return (back.state as Kept).facts;
      const chain = chainOf(el, context.target.loc.file);
      return {
        page: location.href,
        viewport: { width: innerWidth, height: innerHeight },
        ...(at === undefined ? {} : { point: at }),
        ...(pointed === undefined ? {} : { pointed: { path: pathTo(pointed, el), html: pointed.outerHTML.slice(0, 4000) } }),
        count: elements.length,
        ...(chain.length === 0 ? {} : { chain }),
        html: (shots?.masked(el) ?? el).outerHTML.slice(0, HTML),
      };
    };

    /**
     * The shots to attach: one taken now, where that's on, and those in the tray, each the window as it was taken.
     * Only the first has the element outlined in it, or the spot circled (or is as it was taken, where that can't
     * be drawn), so it's first: nothing else in a shot says what the task is about.
     */
    const screenshotsOf = async (): Promise<Sent[] | undefined> => {
      if (shots === undefined) return undefined;
      // One drawn on says its notes, and where the element is in it, where it's this element it was taken of.
      const kept: Sent[] = taken().shots.map(({ id, url, drawn }) => ({
        id,
        url,
        ...(drawn?.about === place ? { box: drawn.shot.box } : {}),
        ...(drawn === undefined || drawn.marks.length === 0 ? {} : { marks: marksOf(drawn.marks) }),
      }));
      if (!shooting()) return kept.length === 0 ? undefined : kept;
      doing.textContent = 'Capturing…';
      const now = await shots.capture(context.element);
      try {
        const { id, url } = await shots.upload(await outlined(now.url, now, context.at), now);
        return [{ id, url, box: now.box, outlined: true }, ...kept];
      } catch {
        return [{ id: now.id, url: now.url, box: now.box }, ...kept];
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
        const { html, ...said } = facts();
        const op: Op = {
          text: text.value,
          ...said,
          ...(sendsHtml && withHtml ? { html } : {}),
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
        const model = await context.apply(op);
        render(model);
        around?.refresh();
        announce(
          model,
          op,
          context.target,
          (screenshots ?? []).map((taken) => taken.url),
        );
        text.value = '';
        grow();
        // The task has them now: what was made for it, and what was drawn on the page for it.
        for (const plugin of KINDS) tray.remove(plugin);
        notes?.clear();
        wanted = undefined;
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
      around?.release();
      for (const stop of unsubscribe) stop?.();
      aborts.abort();
      // A take the popup closes on is kept, in the tray: the next task's.
      void speakOff();
    };
  },
});
