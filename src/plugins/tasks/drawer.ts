/**
 * The tasks' section of the drawer: the channel's tasks still to do, each with its state, and those lately
 * over folded under them. One with something unread (a reply since it was last opened here, or an end no one looked
 * at) says so. A task opens in the drawer: its words, to change while no one has it, its thread, read as it's opened
 * and again every few seconds, a field to answer in, and Delete, which cancels it on the board.
 */
import { named, tell } from '#src/client/component.ts';
import { ATTRIBUTE, MOD, place, toolButton } from '#src/client/dom.ts';
import type { ClientContext } from '#src/index.ts';

import type { Listed, Thread } from './index.ts';
import { OVER, storeOf } from './store.ts';

const STYLE = `
.tasks-drawer h3 .unread { padding: 0 6px; border-radius: 8px; font-weight: 700; letter-spacing: 0; color: var(--deictic-on-accent); background: var(--deictic-accent); }
.tasks-drawer h3 a { margin-left: auto; font-weight: 400; letter-spacing: 0; text-transform: none; color: inherit; }
.tasks-drawer h3 a:hover { color: var(--deictic-fg); }
.task-row { display: grid; grid-template: 'state title mark' auto 'state meta mark' auto / auto minmax(0, 1fr) auto; gap: 2px 8px; align-items: center;
  width: 100%; padding: 8px 10px; border: 1px solid rgb(255 255 255 / 0.08); border-radius: 10px; text-align: left; background: rgb(255 255 255 / 0.04); }
.task-row:hover { border-color: rgb(255 255 255 / 0.16); background: rgb(255 255 255 / 0.06); }
.task-row .title { grid-area: title; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-row .meta { grid-area: meta; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--deictic-muted); }
.task-row.unread .title { font-weight: 600; }
/* What's unread is a dot of the overlay's own green, where a read one has nothing. */
.task-row .mark { grid-area: mark; width: 8px; height: 8px; border-radius: 50%; }
.task-row.unread .mark { background: var(--deictic-accent); box-shadow: 0 0 8px var(--deictic-accent); }
/* The state is a dot, as a board's is: a ring while no one has it, filled once someone does or it's over. */
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
.task-view { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.task-view .stands { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--deictic-muted); }
.task-view .stands .says { flex: 1; }
.task-view .stands a { color: inherit; }
.task-view .stands a:hover, .task-view .act:hover { color: var(--deictic-fg); }
.task-view .act { padding: 1px 6px; border: 0; font-size: 12px; color: var(--deictic-muted); }
.task-view .act.sure { color: var(--deictic-problem); }
.task-view .where { align-self: start; max-width: 100%; padding: 0; border: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 11px ui-monospace, monospace; color: var(--deictic-accent); }
.task-view .where span { color: var(--deictic-muted); }
.task-view .words { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45; }
.task-view .said { padding: 6px 8px; border-left: 2px solid var(--deictic-line); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; color: var(--deictic-muted); }
.task-view textarea { display: block; min-height: 56px; resize: vertical; font: 13px/1.45 system-ui, sans-serif; }
.task-view .buttons { display: flex; justify-content: end; gap: 6px; margin-top: 6px; }
.task-thread { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin: 0; padding: 10px 0 0; border-top: 1px solid rgb(255 255 255 / 0.08); list-style: none; }
.task-thread:empty { display: none; }
.task-thread li { padding: 8px 10px; border: 1px solid rgb(255 255 255 / 0.08); border-radius: 10px; background: rgb(255 255 255 / 0.04); }
.task-thread li.new { border-color: color-mix(in srgb, var(--deictic-accent) 55%, transparent); }
.task-thread .by { display: flex; gap: 6px; align-items: baseline; margin-bottom: 2px; font-size: 11px; color: var(--deictic-muted); }
.task-thread .by b { font-weight: 600; color: var(--deictic-fg); }
.task-thread .by i { margin-left: auto; font-style: normal; }
.task-thread .text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45; }
.task-reply { display: flex; align-items: end; gap: 6px; border: 1px solid var(--deictic-line); border-radius: 12px; background: rgb(0 0 0 / 0.35); }
.task-reply:focus-within { border-color: var(--deictic-accent); box-shadow: 0 0 0 1px var(--deictic-accent); }
.task-reply textarea { min-height: 0; padding: 8px 10px; border: 0; resize: none; background: none; }
.task-reply textarea:focus { outline: none; }
.task-reply button.send { width: 28px; height: 28px; margin: 0 4px 4px 0; border-radius: 50%; color: var(--deictic-on-accent); }
.task-reply button.send svg { width: 16px; height: 16px; }
.task-reply button.send:hover:not(:disabled) { color: var(--deictic-on-accent); background: var(--deictic-accent); filter: brightness(1.1); }
.task-view .problem { font-size: 12px; color: var(--deictic-problem); }
.task-view .problem:empty { display: none; }
/* On the page, around an element a task is about: the open task's, and each one attached in the Task tab. */
.task-about { position: fixed; z-index: 2147483646; box-sizing: border-box; pointer-events: none; border: 1.5px dashed var(--deictic-accent); border-radius: 6px; }
.task-about[hidden] { display: none; }
`;

const SEND = '<path d="M12 19V5M6 11l6-6 6 6"/>';
/** How often an open task's thread is read again, in ms: an agent answers while it's looked at. */
const AGAIN = 5000;
/** How long Delete waits to be pressed again, in ms, before it's only Delete once more. */
const SURE = 3000;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

/** `now`, `5m`, `2h`, `3d`: how long ago, as short as a thread's margin. */
function ago(at: string): string {
  const minutes = Math.round((Date.now() - Date.parse(at)) / 60_000);
  if (!(minutes >= 1)) return 'now';
  if (minutes < 60) return `${minutes}m`;
  return minutes < 60 * 24 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / (60 * 24))}d`;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

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
  const over = element('details');
  const overCount = element('summary');
  const overRows = element('div', { className: 'drawer-rows' });
  over.append(overCount, overRows);
  section.append(element('style', { textContent: STYLE }), heading, rows, over);

  const elementOf = (task: Listed) =>
    task.place === undefined ? null : document.querySelector(`[${ATTRIBUTE}="${CSS.escape(task.place)}"]`);
  /** What a task is about, as the caption says an element: by its component where the page has it, else its tag. */
  const about = (task: Listed) => {
    if (task.place === undefined) return 'the page';
    const el = elementOf(task);
    if (el !== null) return tell(named(el));
    // Not on this page: its tag as the task saw it, and the page it was on where that's another.
    const on = task.page === undefined || task.page === location.pathname ? '' : ` on ${task.page}`;
    return `${task.tag === undefined ? 'an element' : `<${task.tag}>`}${on}`;
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
    row.addEventListener('click', () => view(task));
    return row;
  };
  const draw = () => {
    const tasks = store.tasks();
    const live = tasks.filter((task) => !OVER.has(task.state));
    const ended = tasks.filter((task) => OVER.has(task.state));
    section.hidden = tasks.length === 0;
    const unread = tasks.filter(store.unread).length;
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
    over.hidden = ended.length === 0;
    const news = ended.filter(store.unread).length;
    overCount.textContent = `${ended.length} lately over${news === 0 ? '' : `, ${news} unread`}`;
    overRows.replaceChildren(...ended.map(rowOf));
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

  /** A task, open in the drawer: its words, its thread, and what changes them. */
  function view(first: Listed): void {
    let task = first;
    let editing = false;
    // The reply that was its newest when it was last read: those after it are new, this once.
    const readTo = store.read(first);
    const fresh = store.unread(first);
    // What was answered from here: never new to who wrote it.
    const mine = new Set<string>();

    const el = element('div', { className: 'task-view' });
    const stands = element('div', { className: 'stands' });
    const where = element('button', { type: 'button', className: 'where' });
    const words = element('div');
    const said = element('div', { className: 'said' });
    const thread = element('ol', { className: 'task-thread' });
    const field = element('textarea', { placeholder: 'Reply…', rows: 1 });
    const send = toolButton(SEND, 'Reply', `${MOD}+Enter`, () => void reply());
    send.classList.add('send', 'primary');
    const answer = element('div', { className: 'task-reply' });
    answer.append(field, send);
    const problem = element('div', { className: 'problem' });
    el.append(stands, where, words, said, thread, answer, problem);

    // The element it's about, outlined on the page while it's open, and shown by a press on its name.
    const outline = element('div', { className: 'task-about', hidden: true });
    context.root.append(outline);
    let following = requestAnimationFrame(function follow() {
      following = requestAnimationFrame(follow);
      const about = elementOf(task);
      outline.hidden = about === null;
      if (about !== null) place(outline, about.getBoundingClientRect());
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
      // Only one no one has claimed, as on the board.
      stands.replaceChildren(state, says, ...to, ...(task.open ? [edit, remove] : []));
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
        if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        keep();
      });
      save.addEventListener('click', keep);
      leave.addEventListener('click', done);
      words.className = '';
      words.replaceChildren(text, buttons);
      text.focus();
    };
    /** The task and its thread as just read: drawn, and read by whoever is looking. */
    const shown = (answer: Thread) => {
      task = answer.task;
      problem.textContent = '';
      drawTask();
      if (!editing) drawWords();
      const from = readTo === undefined ? -1 : answer.replies.findIndex((r) => r.id === readTo);
      // At its end only if it was there already, or it has grown: reading up the thread isn't pulled back down.
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
          item.append(by, element('div', { className: 'text', textContent: r.text }));
          return item;
        }),
      );
      if (grew) thread.lastElementChild?.scrollIntoView({ block: 'nearest' });
      store.seen(task);
    };
    const load = () => ask<Thread>(`thread/${encodeURIComponent(task.id)}`).then(shown, failed);
    const reply = async () => {
      if (field.value.trim() === '' || send.disabled) return;
      send.disabled = true;
      try {
        const answer = await ask<Thread>(`reply/${encodeURIComponent(task.id)}`, { text: field.value });
        const last = answer.replies.at(-1);
        if (last !== undefined) mine.add(last.id);
        shown(answer);
        field.value = '';
        grow();
        store.load(true);
      } catch (e) {
        failed(e);
      }
      send.disabled = false;
    };
    const grow = () => {
      field.style.height = 'auto';
      field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
    };
    field.addEventListener('input', grow);
    field.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      void reply();
    });

    drawTask();
    drawWords();
    void load();
    const again = setInterval(() => void load(), AGAIN);
    const close = context.drawer.show(el, {
      title: `#${task.id}`,
      closed: () => {
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
    context.drawer.show(el, { title: `${tasks.length} tasks on ${about(tasks[0]!)}` });
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
