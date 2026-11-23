/**
 * The tasks' section of the drawer: the channel's tasks still to do, each with its state, and the latest finished
 * folded under them, those put away (archived) left out. One with something unread (a reply since it was last opened
 * here, or an end no one looked at) says so, and a row the pointer is on lights its element on the page. A task opens
 * in the drawer: its words, to change while no one has it, what it has attached, its thread, read as it's opened and
 * again every few seconds, a composer to answer in (as the Task tab's, with what a reply can attach), and Delete,
 * which cancels it on the board.
 */
import { named, tell } from '#src/client/component.ts';
import { place } from '#src/client/dom.ts';
import type { ClientContext, LightboxItem } from '#src/index.ts';

import { attachedOf, type Composer, COMPOSER_STYLE, composerIn, element, messageOf, PLAY } from './composer.ts';
import type { Answer, Attached, Listed, Thread } from './index.ts';
import { OVER, storeOf } from './store.ts';
import { elementOf } from './which.ts';

const STYLE = `
.tasks-drawer h3 .unread { padding: 0 6px; border-radius: 8px; font-weight: 700; letter-spacing: 0; color: var(--deictic-on-accent); background: var(--deictic-accent); }
.tasks-drawer h3 a { margin-left: auto; font-weight: 400; letter-spacing: 0; text-transform: none; color: inherit; }
.tasks-drawer h3 a:hover { color: var(--deictic-fg); }
.task-row { display: grid; grid-template: 'state title mark' auto 'state meta mark' auto / auto minmax(0, 1fr) auto; gap: 1px 8px; align-items: center;
  width: 100%; padding: 6px 8px; border: 1px solid rgb(255 255 255 / 0.08); border-radius: 8px; text-align: left; font-size: 12px; background: rgb(255 255 255 / 0.04); }
.task-row:hover { border-color: rgb(255 255 255 / 0.16); background: rgb(255 255 255 / 0.06); }
.task-row .title { grid-area: title; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-row .meta { grid-area: meta; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--deictic-muted); }
.task-row.unread .title { font-weight: 600; }
/* What's unread is a dot of the overlay's own green, where a read one has nothing. */
.task-row .mark { grid-area: mark; width: 7px; height: 7px; border-radius: 50%; }
.task-row.unread .mark { background: var(--deictic-accent); box-shadow: 0 0 8px var(--deictic-accent); }
/* The state is a dot, as a board's is: a ring while no one has it, filled once someone does or it's finished. */
.task-state { grid-area: state; flex: none; box-sizing: border-box; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--deictic-muted); }
.task-state.waiting { border-style: dotted; }
.task-state.claimed { border-color: #60a5fa; background: #60a5fa; }
.task-state.blocked { border-color: #fbbf24; background: #fbbf24; }
.task-state.completed { border-color: #4ade80; background: #4ade80; }
.task-state.failed { border-color: var(--deictic-problem); background: var(--deictic-problem); }
.tasks-drawer details { margin-top: 6px; }
.tasks-drawer summary { cursor: pointer; font-size: 12px; color: var(--deictic-muted); }
.tasks-drawer summary:hover { color: var(--deictic-fg); }
.tasks-drawer details .drawer-rows { margin-top: 6px; }
.tasks-drawer .put-away { justify-self: end; }
.tasks-drawer .act, .task-view .act { padding: 1px 6px; border: 0; font-size: 12px; color: var(--deictic-muted); }
.tasks-drawer .act:hover, .task-view .act:hover { color: var(--deictic-fg); }
.task-view { display: flex; flex-direction: column; gap: 8px; min-height: 0; font-size: 12px; }
.task-view .stands { display: flex; align-items: center; gap: 6px; color: var(--deictic-muted); }
.task-view .stands .says { flex: 1; }
.task-view .stands a { color: inherit; }
.task-view .stands a:hover { color: var(--deictic-fg); }
.task-view .act.sure { color: var(--deictic-problem); }
.task-view .where { align-self: start; max-width: 100%; padding: 0; border: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 11px ui-monospace, monospace; color: var(--deictic-accent); }
.task-view .where span { color: var(--deictic-muted); }
.task-view .words { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.45; }
.task-view .said { padding: 4px 8px; border-left: 2px solid var(--deictic-line); white-space: pre-wrap; overflow-wrap: anywhere; color: var(--deictic-muted); }
.task-view .editing textarea { display: block; box-sizing: border-box; width: 100%; min-height: 56px; resize: vertical; font: 13px/1.45 system-ui, sans-serif; }
.task-view .buttons { display: flex; justify-content: end; gap: 6px; margin-top: 6px; }
/* What a task or a reply has attached: a chip each, which opens all of them in the lightbox. */
.task-files { display: flex; flex-wrap: wrap; gap: 4px; }
.task-files:empty { display: none; }
/* One height, and a thumbnail one size, as the composer's chips: nothing moves as the pictures load. */
.task-files button { box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; max-width: 100%; height: 26px; padding: 0 6px 0 2px; border: 1px solid var(--deictic-line); border-radius: 6px; font-size: 11px; }
.task-files button span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-files img { flex: none; display: block; width: 30px; height: 20px; object-fit: cover; border-radius: 4px; background: var(--deictic-line); }
.task-files .play { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 4px; background: var(--deictic-line); }
.task-files .play svg { width: 10px; height: 10px; }
.task-thread { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; margin: 0; padding: 8px 0 0; border-top: 1px solid rgb(255 255 255 / 0.08); list-style: none; }
.task-thread:empty { display: none; }
.task-thread li { display: grid; gap: 4px; padding: 6px 8px; border: 1px solid rgb(255 255 255 / 0.08); border-radius: 8px; background: rgb(255 255 255 / 0.04); }
.task-thread li.new { border-color: color-mix(in srgb, var(--deictic-accent) 55%, transparent); }
.task-thread .by { display: flex; gap: 6px; align-items: baseline; font-size: 11px; color: var(--deictic-muted); }
.task-thread .by b { font-weight: 600; color: var(--deictic-fg); }
.task-thread .by i { margin-left: auto; font-style: normal; }
.task-thread .text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45; }
.task-view .problem { color: var(--deictic-problem); }
.task-view .problem:empty { display: none; }
/* On the page, around an element a task is about: the open task's, and each one attached in the Task tab. */
.task-about { position: fixed; z-index: 2147483646; box-sizing: border-box; pointer-events: none; border: 1.5px dashed var(--deictic-accent); border-radius: 6px; }
.task-about[hidden] { display: none; }
${COMPOSER_STYLE}`;

/** How often an open task's thread is read again, in ms: an agent answers while it's looked at. */
const AGAIN = 5000;
/** How long Delete waits to be pressed again, in ms, before it's only Delete once more. */
const SURE = 3000;
/** Where what's typed in a reply is kept while its task isn't open: for the tab, over page loads. */
const DRAFTS = 'deictic:tasks:drafts';
const FILE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v4h4"/></svg>';

/** `now`, `5m`, `2h`, `3d`: how long ago, as short as a thread's margin. */
function ago(at: string): string {
  const minutes = Math.round((Date.now() - Date.parse(at)) / 60_000);
  if (!(minutes >= 1)) return 'now';
  if (minutes < 60) return `${minutes}m`;
  return minutes < 60 * 24 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / (60 * 24))}d`;
}

/** What's typed in each task's reply, by its ID. */
function drafts(): Record<string, string> {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(DRAFTS) ?? '{}');
    return typeof kept === 'object' && kept !== null ? (kept as Record<string, string>) : {};
  } catch {
    // Storage can be off: nothing's kept, then.
    return {};
  }
}

function keepDraft(id: string, text: string): void {
  const { [id]: _, ...rest } = drafts();
  try {
    sessionStorage.setItem(DRAFTS, JSON.stringify(text.trim() === '' ? rest : { ...rest, [id]: text }));
  } catch {
    // Not kept past the page, then.
  }
}

/** A board's file as a person names it: what it is, not what deictic called it. */
function nameOf(file: Attached, i: number, all: Attached[]): string {
  const alike = all.filter((other) => kindOf(other) === kindOf(file));
  const n = alike.length === 1 ? '' : ` ${alike.indexOf(file) + 1}`;
  const kind = kindOf(file);
  if (kind === 'image') return `Screenshot${n}`;
  if (kind === 'recording') return `Recording${n}`;
  if (kind === 'audio') return `Voice note${n}`;
  if (/^element(\.\d+)?\.html$/.test(file.name)) return `HTML${n}`;
  return file.name || `File ${i + 1}`;
}

const kindOf = ({ type, name }: Attached) =>
  type.startsWith('image/') ? 'image' : name.startsWith('recording-') ? 'recording' : type.startsWith('audio/') ? 'audio' : 'file';

export interface TasksDrawer {
  /** Opens a task in the drawer, or several to pick from: a pin's. */
  open: (tasks: Listed[]) => void;
}

const made = new WeakMap<ShadowRoot, TasksDrawer>();

/** The tasks' section in the drawer of the overlay `context` is of: added the first time it's asked for. */
export function drawerOf(context: ClientContext): TasksDrawer {
  const known = made.get(context.root);
  if (known !== undefined) return known;

  const store = storeOf(context);
  const section = element('section', { className: 'tasks-drawer', hidden: true });
  const heading = element('h3');
  const rows = element('div', { className: 'drawer-rows' });
  const finished = element('details');
  const finishedCount = element('summary');
  const finishedRows = element('div', { className: 'drawer-rows' });
  const putAway = element('button', {
    type: 'button',
    className: 'act put-away',
    textContent: 'Archive all',
    title: 'Put the finished tasks away: one comes back when something happens to it',
  });
  putAway.addEventListener('click', () => store.archive(store.tasks().filter((task) => OVER.has(task.state))));
  finishedRows.append(putAway);
  finished.append(finishedCount, finishedRows);
  section.append(element('style', { textContent: STYLE }), heading, rows, finished);

  /** What a task is about, as the caption says an element: by its component where the page has it, else its tag. */
  const about = (task: Listed) => {
    if (task.problem !== undefined) return task.problem === 'setup' ? "deictic's setup" : 'a bug in deictic';
    if (task.place === undefined) return 'the page';
    const el = elementOf(task);
    if (el !== null) return tell(named(el));
    // Not on this page: its tag as the task saw it, and the page it was on where that's another.
    const on = task.page === undefined || task.page === location.pathname ? '' : ` on ${task.page}`;
    return `${task.tag === undefined ? 'an element' : `<${task.tag}>`}${on}`;
  };
  /** Lights a task's element on the page while the pointer is on what stands for it here. */
  const lights = (on: HTMLElement, task: () => Listed) => {
    on.addEventListener('pointerenter', () => context.light(elementOf(task()) ?? undefined));
    on.addEventListener('pointerleave', () => context.light());
  };
  const rowOf = (task: Listed) => {
    const row = element('button', { type: 'button', className: `task-row${store.unread(task) ? ' unread' : ''}` });
    const says = task.by === undefined ? task.state : `${task.state} by ${task.by}`;
    const replies = task.replies === 0 ? '' : ` · ${task.replies} ${task.replies === 1 ? 'reply' : 'replies'}`;
    row.append(
      element('span', { className: `task-state ${task.state}`, ariaHidden: 'true' }),
      element('span', { className: 'title', textContent: task.title }),
      element('span', { className: 'meta', textContent: `${says} · ${about(task)}${replies}` }),
      element('span', { className: 'mark', ...(store.unread(task) ? { title: 'Unread' } : {}) }),
    );
    lights(row, () => task);
    row.addEventListener('click', () => {
      context.light();
      view(task);
    });
    return row;
  };
  const draw = () => {
    const tasks = store.tasks().filter((task) => !store.archived(task));
    const live = tasks.filter((task) => !OVER.has(task.state));
    const ended = tasks.filter((task) => OVER.has(task.state));
    section.hidden = tasks.length === 0;
    const unread = tasks.filter(store.unread).length;
    // For the drawer folded away: what's still to do, and what's unread.
    section.dataset.count = String(live.length);
    section.dataset.unread = String(unread);
    const channel = store.channel();
    heading.replaceChildren(
      'Tasks',
      ...(unread === 0 ? [] : [element('span', { className: 'unread', textContent: String(unread), title: `${unread} unread` })]),
      ...(channel?.link === undefined
        ? []
        : [
            element('a', {
              href: channel.link,
              target: '_blank',
              rel: 'noreferrer',
              textContent: `#${channel.name}`,
              title: 'Open the channel on the board',
            }),
          ]),
    );
    rows.replaceChildren(...live.map(rowOf));
    finished.hidden = ended.length === 0;
    const news = ended.filter(store.unread).length;
    finishedCount.textContent = `${ended.length} finished${news === 0 ? '' : `, ${news} unread`}`;
    finishedRows.replaceChildren(...ended.map(rowOf), putAway);
  };
  store.subscribe(draw);
  context.drawer.add(section, { first: true });

  const ask = async <T>(route: string, body?: unknown): Promise<T> => {
    const res = await context.request(
      route,
      body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    );
    const answer = (await res.json()) as T & { problem?: string };
    if (!res.ok) throw new Error(answer.problem ?? `the dev server answered ${res.status}`);
    return answer;
  };

  /** A message's files as chips, each opening them all in the lightbox at itself. */
  const filesOf = (task: string, files: Attached[]): HTMLElement => {
    const list = element('div', { className: 'task-files' });
    const urlOf = (file: Attached) =>
      file.url ?? `${context.base}__deictic/plugins/tasks/file/${encodeURIComponent(task)}/${encodeURIComponent(file.id)}`;
    // What the lightbox shows of each: a picture, a sound, a recording's replay, or a file as text.
    const items: LightboxItem[] = files.map((file, i) => {
      const title = nameOf(file, i, files);
      const kind = kindOf(file);
      if (kind === 'image') return { kind: 'image', url: urlOf(file), title };
      if (kind === 'audio') return { kind: 'audio', url: urlOf(file), title };
      const replay = kind === 'recording' ? file.replay : undefined;
      const url = replay === undefined ? urlOf(file) : `${replay}${replay.includes('?') ? '&' : '?'}embed`;
      const open = replay ?? urlOf(file);
      return {
        kind: 'page',
        url,
        title,
        actions: [{ label: 'New tab', title: 'Open it in a tab of its own', run: () => void window.open(open, '_blank', 'noopener') }],
      };
    });
    list.append(
      ...files.map((file, i) => {
        const name = nameOf(file, i, files);
        // `Open screenshot 2`, but `Open HTML`.
        const said = /^[A-Z]{2}/.test(name) ? name : `${name[0]!.toLowerCase()}${name.slice(1)}`;
        const chip = element('button', { type: 'button', title: `Open ${said}` });
        const kind = kindOf(file);
        const icon =
          kind === 'image'
            ? element('img', { src: urlOf(file), alt: '', loading: 'lazy' })
            : element('span', { className: 'play', innerHTML: kind === 'file' ? FILE : PLAY });
        chip.append(icon, element('span', { textContent: name }));
        chip.addEventListener('click', () => context.lightbox(items, { at: i, from: chip }));
        return chip;
      }),
    );
    return list;
  };

  /** A task, open in the drawer: its words, what's attached, its thread, and what changes them. */
  function view(first: Listed): void {
    let task = first;
    let editing = false;
    // The reply that was its newest when it was last read: those after it are new, this once.
    const readTo = store.read(first);
    const fresh = store.unread(first);
    // What was answered from here: never new to who wrote it.
    const mine = new Set<string>();
    const recorder = context.use('recordings');

    const el = element('div', { className: 'task-view' });
    const stands = element('div', { className: 'stands' });
    const where = element('button', { type: 'button', className: 'where' });
    const words = element('div');
    const files = element('div');
    const said = element('div', { className: 'said' });
    const thread = element('ol', { className: 'task-thread' });
    const problem = element('div', { className: 'problem' });
    // The task's element, lit on the page while the pointer is on its name, as its row's is.
    lights(where, () => task);

    const composer: Composer = composerIn(context, {
      placeholder: 'Reply…',
      sendLabel: 'Reply',
      over: true,
      // What's typed is kept, the drawer closes, and the page is recorded: stopped, the recording is in the tray,
      // and the task opened again has it and the words.
      record: () => {
        if (recorder === undefined) return;
        if (recorder.recording()) {
          composer.problem.textContent = "A recording is going already: stop it in the tool panel, and it's attached here";
          return;
        }
        close();
        void recorder.record();
      },
      submit: async (gathered) => {
        const answer: Answer = { text: gathered.text, ...attachedOf(gathered) };
        const after = await ask<Thread>(`reply/${encodeURIComponent(task.id)}`, answer);
        const last = after.replies.at(-1);
        if (last !== undefined) mine.add(last.id);
        shown(after);
        keepDraft(task.id, '');
        store.load(true);
        return true;
      },
    });
    composer.restore({ text: drafts()[first.id] ?? '' });
    el.append(stands, where, words, files, said, thread, composer.el, problem);

    // The element it's about, outlined on the page while it's open, and shown by a press on its name.
    const outline = element('div', { className: 'task-about', hidden: true });
    context.root.append(outline);
    let following = requestAnimationFrame(function follow() {
      following = requestAnimationFrame(follow);
      const it = elementOf(task);
      outline.hidden = it === null;
      if (it !== null) place(outline, it.getBoundingClientRect());
    });
    where.addEventListener('click', () => elementOf(task)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));

    const failed = (e: unknown) => (problem.textContent = messageOf(e));
    let removing: ReturnType<typeof setTimeout> | undefined;
    const drawTask = () => {
      const state = element('span', { className: `task-state ${task.state}`, ariaHidden: 'true' });
      const says = element('span', { className: 'says', textContent: task.by === undefined ? task.state : `${task.state} by ${task.by}` });
      const to =
        task.link === undefined
          ? []
          : [
              element('a', {
                href: task.link,
                target: '_blank',
                rel: 'noreferrer',
                textContent: 'on the board',
                title: 'Open the task on the board',
              }),
            ];
      const edit = element('button', { type: 'button', className: 'act', textContent: 'Edit', title: 'Change its words' });
      edit.addEventListener('click', () => {
        editing = true;
        drawWords();
      });
      // Twice, as nothing brings a task back: a board never reopens one it canceled.
      const remove = element('button', { type: 'button', className: 'act', textContent: 'Delete', title: 'Cancel it on the board' });
      remove.addEventListener('click', () => {
        if (!remove.classList.contains('sure')) {
          remove.classList.add('sure');
          remove.textContent = 'Delete?';
          removing = setTimeout(() => {
            remove.classList.remove('sure');
            remove.textContent = 'Delete';
          }, SURE);
          return;
        }
        remove.disabled = true;
        ask(`remove/${encodeURIComponent(task.id)}`, {}).then(() => {
          store.load(true);
          close();
        }, failed);
      });
      // A finished one is put away from here, as the list puts them all away.
      const archive = element('button', {
        type: 'button',
        className: 'act',
        textContent: 'Archive',
        title: 'Put it away: it comes back when something happens to it',
      });
      archive.addEventListener('click', () => {
        store.archive([task]);
        close();
      });
      // Edit and Delete only for one no one has claimed, as on the board.
      stands.replaceChildren(state, says, ...to, ...(task.open ? [edit, remove] : []), ...(OVER.has(task.state) ? [archive] : []));
      const at = task.place?.replace(/:\d+$/, '');
      where.replaceChildren(about(task), ...(at === undefined ? [] : [element('span', { textContent: ` ${at}` })]));
      where.disabled = elementOf(task) === null;
      where.title = task.place === undefined ? 'No element was attached' : where.disabled ? 'Not on this page now' : 'Show it on the page';
      said.hidden = task.said === undefined;
      said.textContent = task.said ?? '';
    };
    const drawWords = () => {
      if (!editing) {
        words.className = 'words';
        words.replaceChildren(task.text);
        return;
      }
      const text = element('textarea', { value: task.text });
      const save = element('button', { type: 'button', className: 'primary', textContent: 'Save' });
      const leave = element('button', { type: 'button', textContent: 'Cancel' });
      const buttons = element('div', { className: 'buttons' });
      buttons.append(leave, save);
      const done = () => {
        editing = false;
        drawWords();
      };
      const keep = () => {
        if (text.value.trim() === '') return;
        if (text.value.trim() === task.text) return done();
        save.disabled = true;
        ask<Thread>(`edit/${encodeURIComponent(task.id)}`, { text: text.value }).then(
          (answer) => {
            editing = false;
            shown(answer);
            store.load(true);
          },
          (e: unknown) => {
            save.disabled = false;
            failed(e);
          },
        );
      };
      text.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          // The words' alone: the task stays open.
          e.stopPropagation();
          done();
        }
        // Enter saves, as the composer sends; Shift+Enter is a new line.
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
        e.preventDefault();
        keep();
      });
      save.addEventListener('click', keep);
      leave.addEventListener('click', done);
      words.className = 'editing';
      words.replaceChildren(text, buttons);
      text.focus();
    };
    // What the thread was drawn from, so reading it again redraws only what changed: pictures don't blink.
    let drawn = '';
    /** The task and its thread as just read: drawn, and read by whoever is looking. */
    const shown = (answer: Thread) => {
      task = answer.task;
      problem.textContent = '';
      drawTask();
      if (!editing) drawWords();
      const now = JSON.stringify([answer.files.map((f) => f.id), answer.replies.map((r) => [r.id, r.text, r.files.length]), [...mine]]);
      if (now !== drawn) {
        drawn = now;
        files.replaceChildren(filesOf(task.id, answer.files));
        const from = readTo === undefined ? -1 : answer.replies.findIndex((r) => r.id === readTo);
        // At its end only if it has grown: reading up the thread isn't pulled back down.
        const grew = answer.replies.length !== thread.childElementCount;
        thread.replaceChildren(
          ...answer.replies.map((r, i) => {
            const item = element('li', { className: fresh && i > from && !mine.has(r.id) ? 'new' : '' });
            const by = element('div', { className: 'by' });
            by.append(
              element('b', { textContent: r.by }),
              ...(r.kind === 'person' ? [] : ['agent']),
              element('i', { textContent: ago(r.at), title: new Date(r.at).toLocaleString() }),
            );
            item.append(by, element('div', { className: 'text', textContent: r.text }), filesOf(task.id, r.files));
            return item;
          }),
        );
        if (grew) thread.lastElementChild?.scrollIntoView({ block: 'nearest' });
      }
      store.seen(task);
    };
    const load = () => ask<Thread>(`thread/${encodeURIComponent(task.id)}`).then(shown, failed);

    drawTask();
    drawWords();
    void load();
    const again = setInterval(() => void load(), AGAIN);
    const close = context.drawer.show(el, {
      title: `#${task.id}`,
      closed: () => {
        keepDraft(task.id, composer.draft().text);
        composer.destroy();
        context.light();
        clearInterval(again);
        clearTimeout(removing);
        cancelAnimationFrame(following);
        outline.remove();
      },
    });
  }

  /** Several tasks of one place, to pick from. */
  const pick = (tasks: Listed[]) => {
    const el = element('div', { className: 'drawer-rows' });
    el.append(...tasks.map(rowOf));
    context.drawer.show(el, { title: `${tasks.length} tasks on ${about(tasks[0]!)}`, closed: () => context.light() });
  };

  const drawer: TasksDrawer = {
    open: (tasks) => {
      if (tasks.length === 1) view(tasks[0]!);
      else if (tasks.length > 1) pick(tasks);
    },
  };
  made.set(context.root, drawer);
  return drawer;
}
