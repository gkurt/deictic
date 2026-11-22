/**
 * The tasks panel: the tasks already about this element and their state, and a field to add one. Each
 * task's ID opens it on the board, where the board has a page; one no one has claimed yet can be edited
 * in place (its words) or deleted (canceled on the board), both changes the popup's undo takes back.
 * Ctrl+Enter or Add sends it with the page's URL, the viewport and the element as it rendered, which
 * the source can't tell; and where the annotations plugin is loaded, what's marked on the page.
 *
 * Where the screenshots plugin is loaded, a shot of the page goes with it, unless that's unticked. With
 * the annotations plugin too, Annotate takes the shot now and opens it to draw on: saved, it's a chip
 * under the field, which opens it again to change the marks, and Add another takes one more. Any chip
 * (a recording's too) takes the box's place; removing the last brings it back unticked, so a task goes
 * without a shot unless asked again.
 *
 * Where the recordings plugin is loaded, Record leaves the popup (`away`) to record the page, keeping
 * what's typed and attached, and comes back with the recording as a chip too, which plays it back.
 * Where the voice plugin is, Voice records the mic here in the panel: stopped, it's a chip that plays it.
 */
import { liveWaveform } from '#src/client/waveform.ts';
import { defineClientPlugin, type LightboxItem, type Target } from '#src/index.ts';

// For `use()`'s types: the plugins may not be loaded, and nothing of them runs here.
import type { Annotation, Annotations, Picture } from '#src/plugins/annotations/index.ts';
import type { Recording } from '#src/plugins/recordings/index.ts';
import type { Shot } from '#src/plugins/screenshots/index.ts';
import type { Clip, Take } from '#src/plugins/voice/index.ts';

import type { Change, Marks, Model, Op, Task, TaskAdded } from './index.ts';

const STYLE = `
/* The column is no wider than the panel: an \`auto\` one grows to a long title, which then never truncates. */
.tasks { list-style: none; margin: 0 0 8px; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
/* Five rows, and the rest scrolled to: the field stays where it is however many there are. */
.tasks { max-height: 112px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--deictic-line) transparent; }
/* A task's words being changed need the room. */
.tasks:has(.editing) { max-height: none; }
.tasks li { position: relative; display: flex; gap: 6px; align-items: baseline; }
.tasks .title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tasks .state { font: 11px ui-monospace, monospace; color: var(--deictic-muted); }
.tasks .state.completed { color: #4ade80; }
.tasks .state.failed { color: var(--deictic-problem); }
.tasks a { color: inherit; text-decoration: none; }
.tasks a:hover { text-decoration: underline; }
/* Over the row's end, and only while the row is pointed at or focused in: the title keeps the width. */
.tasks .acts { position: absolute; inset: 0 0 0 auto; display: none; align-items: center; padding-left: 14px; background: linear-gradient(to right, transparent, var(--deictic-bg) 12px); }
.tasks li:hover .acts, .tasks li:focus-within .acts { display: flex; }
.tasks .act { display: inline-flex; padding: 2px; border: 0; color: var(--deictic-muted); }
.tasks .act:hover { color: var(--deictic-fg); }
.tasks .act svg { width: 12px; height: 12px; }
.tasks .place { flex: none; padding: 0; border: 0; font: 11px ui-monospace, monospace; color: var(--deictic-muted); }
.tasks button.place:hover { color: var(--deictic-fg); text-decoration: underline; }
.more { margin: 0 0 8px; }
.more[hidden] { display: none; }
.more summary { cursor: pointer; font-size: 12px; color: var(--deictic-muted); }
.more summary:hover { color: var(--deictic-fg); }
.more .tasks { margin: 4px 0 0; }
.tasks li.editing { display: grid; }
.tasks li.editing .row { margin-top: 0; }
.tasks li.editing .actions { display: flex; gap: 6px; }
textarea { min-height: 64px; resize: vertical; font: 13px/1.4 system-ui, sans-serif; }
.row { display: flex; gap: 6px; margin-top: 8px; justify-content: space-between; align-items: center; }
.hint { color: var(--deictic-muted); font-size: 12px; }
.hint a { color: inherit; }
.hint a:hover { color: var(--deictic-fg); }
.shot { display: flex; gap: 6px; align-items: center; margin-top: 6px; font-size: 12px; color: var(--deictic-muted); }
.shot label { display: flex; gap: 6px; align-items: center; }
.shot input { width: auto; margin: 0; }
.shot .actions { display: flex; gap: 6px; margin-left: auto; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; align-items: center; font-size: 12px; }
.chip { display: inline-flex; align-items: center; border: 1px solid var(--deictic-line); border-radius: 6px; }
.chip button { border: 0; }
.chip .open { display: inline-flex; align-items: center; gap: 6px; padding: 2px 4px 2px 2px; }
.chip img { display: block; height: 28px; border-radius: 4px; }
.chip .play { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 4px; background: var(--deictic-line); }
.chip .play svg { width: 12px; height: 12px; }
.chip .remove { padding: 0 6px; color: var(--deictic-muted); }
.chip .remove:hover { color: var(--deictic-fg); }
.voice-on { display: inline-flex; align-items: center; gap: 4px; color: #fff; background: #ef4444; border-color: #ef4444; font-variant-numeric: tabular-nums; }
.voice-on .wave { width: 36px; height: 14px; }
.shot-problem { margin-top: 4px; font-size: 12px; color: var(--deictic-problem); }
.shot-problem:empty { display: none; }
.shot[hidden], .chips[hidden], label[hidden] { display: none; }
`;

const ICON = (path: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
const EDIT = ICON('M4 20h4L19 9l-4-4L4 16z');
const DELETE = ICON('M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13');
/** The states of a task that's over, as a board names them: nothing more happens to it. */
const OVER = new Set(['completed', 'failed']);
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" fill="currentColor"/></svg>';

/** Marks as a task tells of them: how many, and what the notes say. */
function marksOf(list: readonly Annotation[]): Marks {
  return { count: list.length, notes: list.flatMap(({ shape }) => (shape.kind === 'note' ? [shape.text] : [])) };
}

/** The page's annotations for the op, where there are any. */
function annotationsOf(marks: Annotations | undefined): Pick<Op, 'annotations'> {
  const list = marks?.list() ?? [];
  return list.length === 0 ? {} : { annotations: marksOf(list) };
}

/** An annotated shot: the shot as taken, the marks drawn on it, and the PNG of both. */
interface Drawn {
  shot: Shot;
  marks: Annotation[];
  png: Blob;
}

/** A drawn shot as the panel shows it, with a URL for its thumbnail, revoked with it. */
interface Chip extends Drawn {
  url: string;
}

/** What the panel keeps while it's away recording: what's typed, ticked and attached. */
interface Kept {
  text: string;
  attach: boolean;
  drawn: Drawn[];
  recordings: Recording[];
  voices: Clip[];
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

function element<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

/** The event the page hears of each added task by, on `window`: its `detail` is a `TaskAdded`. */
export const TASK_ADDED = 'deictic:task';

/** Tells the page of a task just added: the newest of the element's tasks, as the board answered them. */
function announce(model: Model, op: Op, target: Target): void {
  const task = model.tasks.at(-1);
  if (task === undefined) return;
  const marks = (op.annotations?.count ?? 0) + (op.screenshots ?? []).reduce((n, shot) => n + (shot.marks?.count ?? 0), 0);
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
      marks,
    },
  };
  window.dispatchEvent(new CustomEvent(TASK_ADDED, { detail }));
}

export default defineClientPlugin<Model, Change>({
  name: 'tasks',
  label: 'Task',
  mount: (panel, context) => {
    const style = element('style', { textContent: STYLE });
    const list = element('ul', { className: 'tasks' });
    const text = element('textarea', { placeholder: 'What should change here?' });
    const add = element('button', { type: 'button', className: 'primary', textContent: 'Add task' });
    const hint = element('span', { className: 'hint' });
    const row = element('div', { className: 'row' });
    row.append(hint, add);
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
    panel.append(style, list, closed, fold, text);

    const shots = context.use('screenshots');
    const notes = context.use('annotations');
    const recorder = context.use('recordings');
    const voice = context.use('voice');
    // Closes an open editor with the panel.
    const aborts = new AbortController();

    const attach = element('input', { type: 'checkbox', checked: true });
    const toggle = element('label', { hidden: shots === undefined });
    toggle.append(attach, 'Attach a screenshot');
    const annotate = element('button', { type: 'button', textContent: 'Annotate', title: 'Take the screenshot now and draw on it' });
    const record = element('button', {
      type: 'button',
      textContent: 'Record',
      title: 'Record the page, with a toolbar to draw on it, then come back here',
    });
    const speak = element('button', { type: 'button', textContent: 'Voice', title: 'Record your voice, here' });
    const actions = element('span', { className: 'actions' });
    actions.append(...(shots !== undefined && notes !== undefined ? [annotate] : []));
    const shot = element('div', { className: 'shot' });
    shot.append(toggle, actions);
    const chipsEl = element('div', { className: 'chips' });
    const another = element('button', { type: 'button', textContent: 'Add another', title: 'Take another screenshot and draw on it' });
    const problem = element('div', { className: 'shot-problem' });
    if (shots !== undefined || recorder !== undefined || voice !== undefined) panel.append(shot, chipsEl, problem);
    panel.append(row);

    let chips: Chip[] = [];
    let recordings: Recording[] = [];
    let voices: Clip[] = [];
    let busy = false;
    const attachedCount = () => chips.length + recordings.length + voices.length;
    // A task goes with words, or with something attached that says it; not while one is going.
    let sending = false;
    const able = () => (add.disabled = sending || (text.value.trim() === '' && attachedCount() === 0));
    // Record and Voice, where their plugins are: beside Annotate, or after the chips while the box is away.
    const more = () => [...(recorder !== undefined ? [record] : []), ...(voice !== undefined ? [speak] : [])];
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
    const shotName = (i: number) => `Screenshot ${i + 1}`;
    const recordingName = (i: number) => (recordings.length === 1 ? 'Recording' : `Recording ${i + 1}`);
    const voiceName = (i: number) => (voices.length === 1 ? 'Voice' : `Voice ${i + 1}`);
    /** What's attached, as the lightbox shows it, in the chips' order. */
    const viewed = (): LightboxItem[] => [
      ...chips.map((c, i) => ({
        kind: 'image' as const,
        url: c.url,
        title: shotName(i),
        actions: [{ label: 'Change marks', title: 'Draw on it again', run: () => void draw(c) }],
      })),
      ...recordings.map((r, i) => ({
        kind: 'page' as const,
        // The replay filling the frame, without a header of its own: the lightbox names it.
        url: `${r.url}${r.url.includes('?') ? '&' : '?'}embed`,
        title: `${recordingName(i)} · ${clock(r.duration)}`,
        actions: [
          { label: 'New tab', title: 'Play it back in a tab of its own', run: () => void window.open(r.url, '_blank', 'noopener') },
        ],
      })),
      ...voices.map((v, i) => ({ kind: 'audio' as const, url: v.url, title: `${voiceName(i)} · ${clock(v.duration)}` })),
    ];
    const showChips = () => {
      // The box stands for a shot taken as the task goes, so it's away while anything else is attached.
      const attached = attachedCount() > 0;
      shot.hidden = attached;
      chipsEl.hidden = !attached;
      if (!busy) another.textContent = chips.length > 0 ? 'Add another' : 'Annotate';
      if (!attached) actions.append(...more());
      chipsEl.replaceChildren(
        ...chips.map((c, i) => {
          const thumb = element('img', { src: c.url, alt: '' });
          return chip([thumb, shotName(i)], `Open ${shotName(i).toLowerCase()}`, i, `Remove ${shotName(i).toLowerCase()}`, () =>
            dropShot(c),
          );
        }),
        ...recordings.map((r, i) => {
          const play = element('span', { className: 'play', innerHTML: PLAY });
          return chip(
            [play, `${recordingName(i)} ${clock(r.duration)}${r.voice === undefined ? '' : ' · voice'}`],
            `Play ${recordingName(i).toLowerCase()} back`,
            chips.length + i,
            `Remove ${recordingName(i).toLowerCase()}`,
            () => {
              recordings = recordings.filter((x) => x !== r);
              dropped();
            },
          );
        }),
        ...voices.map((v, i) => {
          const play = element('span', { className: 'play', innerHTML: PLAY });
          return chip(
            [play, `${voiceName(i)} ${clock(v.duration)}`],
            `Play ${voiceName(i).toLowerCase()}`,
            chips.length + recordings.length + i,
            `Remove ${voiceName(i).toLowerCase()}`,
            () => {
              voices = voices.filter((x) => x !== v);
              dropped();
            },
          );
        }),
        ...(attached && shots !== undefined && notes !== undefined ? [another] : []),
        ...(attached ? more() : []),
      );
      able();
      mark();
    };
    const dropShot = (c: Chip) => {
      URL.revokeObjectURL(c.url);
      chips = chips.filter((x) => x !== c);
      dropped();
    };
    // Back to the box, unticked, once the last is gone: what was attached is, so nothing is until it's asked for again.
    const dropped = () => {
      if (attachedCount() === 0) attach.checked = false;
      showChips();
    };
    const toChip = (drawn: Drawn): Chip => ({ ...drawn, url: URL.createObjectURL(drawn.png) });
    const reset = () => {
      for (const c of chips) URL.revokeObjectURL(c.url);
      chips = [];
      recordings = [];
      voices = [];
      attach.checked = true;
      showChips();
    };

    /** Takes a shot and opens it to draw on, or opens a chip's again: saved, it's a chip. */
    const draw = async (old?: Chip) => {
      if (shots === undefined || notes === undefined || busy) return;
      busy = true;
      const was = { annotate: annotate.textContent, another: another.textContent };
      annotate.textContent = another.textContent = old === undefined ? 'Capturing…' : was.another;
      problem.textContent = '';
      try {
        const taken = old?.shot ?? (await shots.capture(context.element));
        annotate.textContent = was.annotate;
        another.textContent = was.another;
        const picture: Picture = { url: taken.url, ...taken.size };
        const marks = await notes.edit(picture, old?.marks ?? [], { signal: aborts.signal });
        if (marks === undefined) return;
        const next = toChip({ shot: taken, marks, png: await notes.flatten(picture, marks) });
        if (old === undefined) {
          chips = [...chips, next];
        } else {
          URL.revokeObjectURL(old.url);
          chips = chips.map((c) => (c === old ? next : c));
        }
        showChips();
      } catch (e) {
        problem.textContent = messageOf(e);
      } finally {
        annotate.textContent = was.annotate;
        another.textContent = was.another;
        busy = false;
        showChips();
      }
    };
    annotate.addEventListener('click', () => void draw());
    another.addEventListener('click', () => void draw());
    record.addEventListener('click', () => {
      if (recorder === undefined || busy) return;
      // A take going on is kept first, as a chip, to come back to with the rest.
      void speakOff().then(() => {
        const drawn = chips.map(({ url: _, ...d }) => d);
        const kept: Kept = { text: text.value, attach: attach.checked, drawn, recordings, voices };
        context.away(kept, () => recorder.record());
      });
    });

    // The mic, here: Voice starts a take, the same button (now its time) stops it, and it's a chip.
    let take: Take | undefined;
    let ticking: ReturnType<typeof setInterval> | undefined;
    let stopWave: (() => void) | undefined;
    const speakOn = async () => {
      if (voice === undefined) return;
      problem.textContent = '';
      speak.disabled = true;
      try {
        take = await voice.start();
      } catch (e) {
        problem.textContent = messageOf(e);
        return;
      } finally {
        speak.disabled = false;
      }
      const started = take.started;
      // The time, the mic's live waveform, so it's plain it hears, and what a click does.
      const time = element('span', { className: 'time' });
      const wave = element('canvas', { className: 'wave' });
      speak.replaceChildren('● ', time, wave, 'Stop');
      stopWave = liveWaveform(wave, take.stream, { played: '#fff', rest: 'rgb(255 255 255 / 0.4)' });
      const tick = () => (time.textContent = clock(Date.now() - started));
      speak.classList.add('voice-on');
      speak.title = 'Stop, and attach it';
      tick();
      ticking = setInterval(tick, 250);
      mark();
    };
    const speakOff = async () => {
      const ending = take;
      if (ending === undefined) return;
      take = undefined;
      clearInterval(ticking);
      stopWave?.();
      stopWave = undefined;
      speak.classList.remove('voice-on');
      speak.textContent = 'Saving…';
      try {
        voices = [...voices, await ending.stop()];
      } catch (e) {
        problem.textContent = messageOf(e);
      } finally {
        speak.textContent = 'Voice';
        speak.title = 'Record your voice, here';
        showChips();
      }
    };
    speak.addEventListener('click', () => void (take === undefined ? speakOn() : speakOff()));

    // The task whose words are open to change, by ID, and the tasks as last read.
    let editing: string | undefined;
    // The Save of a listed task whose words were changed and not kept yet.
    let edited: HTMLElement | undefined;
    /** Tells the popup what leaving now would lose: a listed task's changed words, or a new one's, typed, attached or being spoken. */
    const mark = () => context.unsaved(edited ?? (text.value.trim() !== '' || attachedCount() > 0 || take !== undefined ? add : undefined));
    let shown = context.model;
    /** Asks for a change to a listed task and shows the tasks as they are after; the panel's status says why not. */
    const change = async (op: Change) => {
      try {
        editing = undefined;
        render(await context.apply(op));
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
      const { channel, link, tasks, elsewhere } = model;
      const name =
        link === undefined
          ? element('span')
          : element('a', { href: link, target: '_blank', rel: 'noreferrer', title: 'Open the channel on the board' });
      name.textContent = `#${channel}`;
      hint.replaceChildren('to ', name);
      /** A task's row: its ID, a link where it has a page, its title, where it's from when that's said, and its state. */
      const rowOf = (t: Task, from?: HTMLElement) => {
        const item = element('li');
        const id = element('code', { textContent: `#${t.id}` });
        const title = element('span', { className: 'title', textContent: t.title, title: t.title });
        const state = element('span', { className: `state ${t.state}`, textContent: t.state });
        const to =
          t.link === undefined
            ? id
            : element('a', { href: t.link, target: '_blank', rel: 'noreferrer', title: 'Open the task on the board' });
        if (to !== id) to.append(id);
        item.append(to, title, ...(from === undefined ? [] : [from]), state);
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
      if (grew) list.scrollTop = list.scrollHeight;
      able();
      mark();
    };

    /** The shots to attach: each chip's PNG, kept as a shot, or a shot taken now where the box is ticked. */
    const screenshotsOf = async (): Promise<Op['screenshots']> => {
      if (shots === undefined) return undefined;
      if (chips.length > 0) {
        add.textContent = 'Uploading…';
        return Promise.all(
          chips.map(async ({ shot: taken, marks, png }) => ({
            id: (await shots.upload(png, taken)).id,
            box: taken.box,
            ...(marks.length === 0 ? {} : { marks: marksOf(marks) }),
          })),
        );
      }
      // With a recording attached the box is away, so no shot is asked for.
      if (!attach.checked || recordings.length > 0) return undefined;
      add.textContent = 'Capturing…';
      const { id, box } = await shots.capture(context.element);
      return [{ id, box }];
    };

    const send = async () => {
      if (busy || sending) return;
      // A take still going is kept first: it may be all there is to send.
      await speakOff();
      if (able()) return;
      sending = true;
      able();
      problem.textContent = '';
      let screenshots: Op['screenshots'];
      try {
        screenshots = await screenshotsOf();
      } catch (e) {
        // Said under the shots, which stay as they are: untick the box, or remove the chips, to send without.
        problem.textContent = messageOf(e);
        add.textContent = 'Add task';
        sending = false;
        able();
        return;
      }
      add.textContent = 'Add task';
      const { element: el, elements } = context;
      try {
        const op: Op = {
          text: text.value,
          page: location.href,
          viewport: { width: innerWidth, height: innerHeight },
          ...(context.pointed === undefined
            ? {}
            : { pointed: { path: pathTo(context.pointed, el), html: context.pointed.outerHTML.slice(0, 4000) } }),
          count: elements.length,
          ...(screenshots === undefined ? {} : { screenshots }),
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
        announce(model, op, context.target);
        text.value = '';
        reset();
      } catch {
        // The panel's status says why; what was typed and drawn stays, to send again.
      }
      sending = false;
      able();
    };

    // Back from recording: what was kept, and the recording, or why there's none.
    const back = context.resumed;
    if (back !== undefined) {
      const kept = back.state as Kept;
      text.value = kept.text;
      attach.checked = kept.attach;
      chips = kept.drawn.map(toChip);
      recordings = [...kept.recordings, ...(back.result === undefined ? [] : [back.result as Recording])];
      voices = kept.voices;
      if (back.problem !== undefined) problem.textContent = back.problem;
    }

    text.addEventListener('input', () => {
      able();
      mark();
    });
    text.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      void send();
    });
    add.addEventListener('click', () => void send());
    showChips();
    render(context.model);
    text.focus();
    return () => {
      aborts.abort();
      take?.cancel();
      clearInterval(ticking);
      stopWave?.();
      for (const c of chips) URL.revokeObjectURL(c.url);
    };
  },
});
