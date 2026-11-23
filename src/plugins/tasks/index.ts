/**
 * `deictic/tasks`: open its tab on an element to add a task about it to a Vercel Board
 * (`@vercel/board`). The task says what to change, in the words typed, and where: the element's file,
 * line and tag, the page and the project, all as labels beside the short facts (viewport, how many, where
 * it is in the shot) and the chain of source it rendered through, out to the files that use its component. Its HTML as it rendered is a file attached, `element.html`, for whoever
 * wants more than the task says: a task stays short. Whatever works the board's tasks (a person, or an agent of theirs claiming them) takes it
 * from there; deictic only adds them.
 *
 * Adding one is a change like any other: undo cancels the task, while no one has claimed it, and redo
 * adds it again, as a new task. Each task carries `deictic.at=<file:line:column>` and `deictic.file`, so
 * the panel lists the ones about the element clicked, and after them the rest of its file's. One whose
 * place is no longer the element's is still its own where the tag and the line it saw (`deictic.line`) are
 * the element's, and that line is in the file once: the element has moved, as lines above it changed.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { Board } from '@vercel/board';

import { definePlugin, type Point, Refusal, type ServerContext, type Shortcut, type Source, type Target } from '#src/index.ts';
// For `use('screenshots')`'s type: the plugin may not be loaded, and nothing of it runs here.
import type { Recordings } from '#src/plugins/recordings/index.ts';
import type { Box } from '#src/plugins/screenshots/index.ts';
import type { Clips } from '#src/plugins/voice/index.ts';

import { type LocalBoard, localBoard } from './local.ts';
import { watchersOf } from './watchers.ts';

export { local, type LocalBoard, type LocalOptions } from './local.ts';

/** What the plugin uses of a board: `board()` from `@vercel/board` is one. */
export type TaskBoard = Pick<Board, 'tasks' | 'thread' | 'threads' | 'reply' | 'discovery' | 'upload' | 'download' | 'edit' | 'actors'>;

export interface TasksOptions {
  /**
   * The board, as `@vercel/board`'s `board()` answers it. By default the one `BOARD_URL` names, and with none,
   * one of the project's own on this machine: `vb serve`, started with the dev server and stopped with it, at
   * `http://127.0.0.1:4100/api/board` (or the port `.deictic/board.json` says, where that one's taken), its log
   * in `.deictic/board`. For your team's board, through `vercel login`, pass `board()`. `local()`, from here, is
   * that board of the project's own whatever `BOARD_URL` says, with its port, its folder and the rest as options.
   */
  board?: TaskBoard | LocalBoard;
  /** The channel tasks go to: `deictic` by default. */
  channel?: string;
  /**
   * The project the tasks are about, as the `deictic.project` label, to tell them apart on a board several
   * projects share: by default the `name` in the root's `package.json`, and no label where it has none.
   */
  project?: string;
  /** Labels every task gets besides deictic's own, for whoever works them to filter by (`vb tail --label`). None by default. */
  labels?: Record<string, string>;
  /**
   * Where the panel links the channel to, for a person to see its tasks, and with `task`, where it links
   * that task's ID to. By default the board's own pages when it's one `vb serve` runs on this machine
   * (`http://127.0.0.1:4100/c/deictic`, and `?thread=<id>` on it), and none for another board, whose pages
   * deictic can't know.
   */
  link?: (channel: string, task?: string) => string | undefined;
  /**
   * Whether a task has the element's HTML as it rendered attached, as `element.html`, masked as a screenshot is
   * (the screenshots plugin's masking, where it's loaded): what was on the page, for whoever can't open it as the
   * person did. True by default: the Task tab has a box for it, ticked, to untick for a task that should go
   * without. `false` takes the box away, where a page shows what the board shouldn't hold.
   */
  html?: boolean;
  /** What opens its tab directly, beside deictic's own shortcut, which opens any: none by default. */
  shortcut?: Shortcut;
}

export interface Task {
  id: string;
  /** The first line of what was typed. */
  title: string;
  /** What was typed, whole: what an edit changes. */
  text: string;
  state: string;
  /** Who holds its claim, by name (`claude`), while it's claimed. A board keeps no one for a task's end. */
  by?: string;
  /** Whether it can still be edited or deleted: no one has claimed it. */
  open: boolean;
  /** Its page on the board, when there's one to link to. */
  link?: string;
  /** What was attached to it but not kept by the time it was sent, so it went without: `a screenshot`. */
  dropped?: string;
  /** The spot in the element it's about, where it's about one: CSS pixels from the element's top left. */
  point?: Point;
  /**
   * Where it was added, where that isn't the element's place: where the element was before it moved.
   */
  at?: Place;
}

/** A place in the element's file: a line and a column, from 1, and the tag there as the task saw it. */
export interface Place {
  line: number;
  column: number;
  tag: string;
}

/** A task as the drawer lists it: with its place, where it has one, and how its thread stands. */
export interface Listed extends Task {
  /** `file:line:column`, as the element's mark: none for a task about the page. */
  place?: string;
  /** The tag there, as the task saw it. */
  tag?: string;
  /** The page it was added on, as its path: `/pricing`. */
  page?: string;
  /** How many replies its thread has, and the newest's ID: what the page tells the unread by. */
  replies: number;
  last?: string;
  /** What the board says of where it stands: why it's blocked, what it came to, why it failed. */
  said?: string;
}

/** A task with a place, as its mark has it: what the page pins to the element there. */
export type Placed = Listed & { place: string };

/** A file attached to a task or to a reply in its thread, as the board keeps it. */
export interface Attached {
  /** The board's ID for it. */
  id: string;
  name: string;
  /** Its MIME type: `image/png`, `audio/webm`, `application/json` for a recording, `text/html` for an element's HTML. */
  type: string;
  /** In bytes. */
  size: number;
  /**
   * Where the page gets it: by default the plugin's `file/<task>/<id>` route, which serves an image or a sound as it
   * is and anything else as text. A `standalone` server answers its own.
   */
  url?: string;
  /** Where a recording plays back, as the message says. */
  replay?: string;
}

/** A message in a task's thread, oldest first. */
export interface Reply {
  id: string;
  /** Who wrote it, by name. */
  by: string;
  /** `person`, or what else wrote it: an agent's `profile`, a deployment, a workflow. */
  kind: string;
  text: string;
  /** When, as an ISO date. */
  at: string;
  /** What it has attached. */
  files: Attached[];
}

/** A task with its thread, as the drawer opens it. */
export interface Thread {
  task: Listed;
  /** What the task has attached: its shots, recordings, voice notes and elements' HTML. */
  files: Attached[];
  replies: Reply[];
}

/**
 * A reply, as the drawer's composer sends it to the `reply/<id>` route: its words, and what's attached, as a task
 * attaches it. A reply with nothing typed says what's attached instead.
 */
export type Answer = Pick<Op, 'text' | 'screenshots' | 'recordings' | 'voice' | 'annotations'>;

export interface Model {
  channel: string;
  /** The channel's page, when there's one to link to. */
  link?: string;
  /** Tasks about this element, oldest first, canceled ones left out: also those added before it moved. */
  tasks: Task[];
  /**
   * Who watches the channel, by name (`claude`): the agents whose watch (`deictic watch`) is running in
   * this project, as a board can't say, and those holding a claim on one of the channel's tasks, which it can.
   * Empty where none is and the board is this machine's own;
   * left out where none is and the board is another, which an agent may watch from elsewhere.
   */
  watching?: string[];
}

/** A new task: what the page knows and the source doesn't. */
export interface Op {
  text: string;
  /** The page's URL. */
  page: string;
  viewport: { width: number; height: number };
  /**
   * The spot it's about, where it was added on one (the tool panel's task tool) and not on the element as a whole:
   * CSS pixels from the element's top left, and outside its box where the element is only the nearest to the spot.
   */
  point?: Point;
  /**
   * What was under the pointer inside the element, where nothing marked it (a dependency's markup, or a
   * shadow root's): its path from the element, and its HTML, cut short.
   */
  pointed?: { path: string; html: string };
  /** How many elements on the page come from the same place in the source. */
  count: number;
  /**
   * The other elements it's about, after the one it's sent on, in the order they were attached: each one's place,
   * its tag, and its HTML as it rendered, where that's attached.
   */
  also?: { at: string; tag: string; html?: string }[];
  /**
   * No element is attached: it's about the page, and the element it's sent on is only where the popup was. It has
   * no place then, so no element's tab lists it and nothing pins it.
   */
  detached?: boolean;
  /**
   * The source it rendered through, after its own place, nearest first: where the one before it is used. With
   * React in development, the components that wrote it, `Field (src/Field.tsx:20)` or a name alone; without, the
   * files around it, each a `file:line`. A shared component's line says nothing of which use of it this is, and
   * these do.
   */
  chain?: string[];
  /** The element's HTML as it rendered, to attach: cut short, and masked where the screenshots plugin is loaded. */
  html?: string;
  /**
   * Shots the screenshots plugin took, to attach, where that plugin is loaded: each with where the element is in
   * it (`box`, for one taken of the element; one taken of the window from the tool panel has none), whether
   * it's `outlined` there (dashes drawn around it, or around the spot, in the PNG), and the marks drawn on it in
   * the Task tab, where there are any.
   */
  screenshots?: { id: string; box?: Box; outlined?: boolean; marks?: Marks }[];
  /**
   * Recordings the recordings plugin made, to attach, where that plugin is loaded: how long each ran,
   * where it plays back, and the voice plugin's clips of the mic in it, attached too.
   */
  recordings?: { id: string; duration: number; replay: string; voice?: string[] }[];
  /** Voice notes the voice plugin kept, to attach, where that plugin is loaded, and how long each runs. */
  voice?: { id: string; duration: number }[];
  /** The page's annotations, where that plugin is loaded and there are any: how many, and their notes' text. */
  annotations?: Marks;
}

/**
 * A task the Task tab just added, as the page hears of it: the `detail` of a `deictic:task` event on `window`, for a
 * page that shows its own tasks (deictic's playground lists them as a board does).
 */
export interface TaskAdded {
  id: string;
  /** The first line of what was typed. */
  title: string;
  state: string;
  channel: string;
  /** The element: its file, line and column, and its tag. */
  target: Target;
  /** The page's URL. */
  page: string;
  /** How many of each were attached; `marks` counts those drawn on shots and on the page. */
  attached: { screenshots: number; recordings: number; voice: number; marks: number };
  /**
   * Where each attached shot is, as it was sent (outlined, or as it was drawn on), for the page to show: the
   * screenshots plugin's `shot` route, or what a `standalone` server answered.
   */
  screenshots: string[];
}

/** Marks, as a task tells of them: how many, and what the notes among them say. */
export interface Marks {
  count: number;
  notes: string[];
}

export interface Added {
  channel: string;
  id: string;
  text: string;
  labels: Record<string, string>;
  /** What's attached, by the board's IDs: kept, so a redo attaches the same without uploading it again. */
  attachments?: string[];
}

/** A task's words changed in the tab, as an earlier version let it: its message's whole text before and after. */
export interface Edited {
  kind: 'edited';
  id: string;
  before: string;
  after: string;
}

/**
 * A task deleted in the tab, as an earlier version let it: canceled on the board, for good, as a board has it. So
 * it's kept whole, and an undo adds it again, as a new task whose ID the record then has.
 */
export interface Removed extends Added {
  kind: 'removed';
}

/**
 * What the history keeps of a change: a task added has no `kind`, as it had none before there were others. The others
 * are no longer made (a task is changed in the drawer, by the plugin's routes), and still undone where a history has them.
 */
export type Kept = Added | Edited | Removed;

/** A task as a board lists it: its root message. */
type Message = Awaited<ReturnType<TaskBoard['thread']>>['message'];
/** A task's thread at a glance, as a board lists tasks. */
type Summary = Awaited<ReturnType<TaskBoard['tasks']['list']>>['tasks'][number];
/** How many of the latest finished tasks the drawer lists: what an agent said as it ended one is there to read. */
const OVER = 10;

/** How many tasks a page is asked about at most: past that it has more pins than anyone reads. */
const PINNED = 500;
const AT = 'deictic.at';
const FILE = 'deictic.file';
/** `x,y`: the spot in the element a task is about, in CSS pixels from the element's top left. */
const POINT = 'deictic.point';
/** What parts what was typed from the rest of a task's text. */
const REST = '\n---\n';
/** A file for the board, as the plugins that keep them read it. */
type Upload = { data: Uint8Array<ArrayBuffer>; name: string; type: string };
const OPEN = new Set(['waiting', 'ready', 'blocked']);

export function tasks(options: TasksOptions = {}) {
  const channel = options.channel ?? 'deictic';
  let team: Promise<TaskBoard> | undefined;
  let root: string | undefined;
  const own = options.board !== undefined && 'local' in options.board ? options.board.local : undefined;
  const found = async (): Promise<TaskBoard> => {
    if (options.board !== undefined && !('local' in options.board)) return options.board;
    // Loaded when first used, so a project that doesn't add this plugin needn't install the SDK.
    const { board } = await import('@vercel/board');
    if (own === undefined && process.env.BOARD_URL !== undefined) return board();

    const base = root ?? process.cwd();
    const { url, fresh, dir } = await localBoard(base, own);
    if (fresh) {
      const kept = relative(base, dir).replaceAll('\\', '/');
      console.log(`deictic/tasks: tasks go to a board on this machine, ${url.replace(/\/api\/board$/, '/')} (kept in ${kept})`);
    }
    // `board()` takes a URL from the environment only, as it's called: so it's set for the call, and what the
    // environment said is left as it was.
    const before = process.env.BOARD_URL;
    process.env.BOARD_URL = url;
    try {
      return board();
    } finally {
      if (before === undefined) delete process.env.BOARD_URL;
      else process.env.BOARD_URL = before;
    }
  };
  // Asked again after a failure: a board that didn't start may the next time.
  const boardOf = () =>
    (team ??= found().catch((e: unknown) => {
      team = undefined;
      throw e;
    }));
  let link: Promise<string | undefined> | undefined;
  // Asked once, unless asking failed: no link is no reason to keep the panel from showing the tasks.
  const linkOf = () =>
    (link ??= (
      options.link
        ? Promise.resolve(options.link(channel))
        : boardOf().then((b) => (own?.inspect === false ? undefined : localPage(b, channel)))
    ).catch(() => {
      link = undefined;
      return undefined;
    }));
  /** A task's page: what `link` says, or its thread on the channel's own page on this machine. */
  const taskLink = (page: string | undefined, id: string) =>
    options.link ? options.link(channel, id) : page === undefined ? undefined : `${page}?thread=${encodeURIComponent(id)}`;
  /**
   * One of this channel's tasks about an element, while it's still open: the page names it by ID, so
   * nothing else on the board is its to change, nor a task someone has taken up.
   */
  /** One of deictic's: it has a place, or the page it's about where no element was attached. */
  const ours = (message: Message) => message.labels[AT] !== undefined || message.labels['deictic.page'] !== undefined;
  const openTask = async (team: TaskBoard, id: string, verb: string) => {
    const { message } = await team.thread(id);
    if (message.channel !== channel || !ours(message))
      throw new Refusal(`#${id} isn't a task of deictic's in #${channel}: reload the page for the ones that are`);

    const { task } = message;
    if (task !== undefined && !OPEN.has(task.state)) {
      throw new Refusal(
        `task ${id} is ${task.state}${task.claim ? ` by ${task.claim.actor}` : ''} now: ${verb} it on the board if you still mean to`,
      );
    }
    return message;
  };
  /** Cancels an open task of ours, and answers it as it was. */
  const cancel = async (id: string, reason: string) => {
    const team = await boardOf();
    const message = await openTask(team, id, 'cancel');
    await team.tasks.cancel(id, reason);
    return message;
  };
  /** Puts a task's text from one to the other, unless it reads as neither any more. */
  const rewrite = async (id: string, from: string, to: string) => {
    const team = await boardOf();
    const message = await openTask(team, id, 'edit');
    if (message.text === to) return;
    if (message.text !== from) throw new Refusal(`task ${id} has been edited since: change it on the board`);
    await team.edit(id, to, { revision: message.revision });
  };
  const create = async (record: Omit<Added, 'id'>): Promise<Added> => {
    const { task } = await (
      await boardOf()
    ).tasks.create(record.channel, {
      text: record.text,
      labels: record.labels,
      ...(record.attachments === undefined ? {} : { attachments: record.attachments }),
    });
    return { ...record, id: task.id };
  };

  /** A board's task as the panel lists it: its words, its state, who has it, and its page there. */
  const taskOf = (message: Message, actors: Awaited<ReturnType<typeof actorsOf>>, page: string | undefined): Task => {
    const state = message.task?.state ?? 'ready';
    const by = actors.get(message.task?.claim?.actor ?? '')?.name;
    const text = message.text.split(REST, 1)[0]!;
    const to = taskLink(page, message.id);
    const missing = Object.entries(message.labels).flatMap(([key, value]) => (/^deictic\.dropped\.\d+$/.test(key) ? [value] : []));
    const dropped = missing.length === 0 ? undefined : listOf(missing);
    const [, x, y] = /^(-?\d+),(-?\d+)$/.exec(message.labels[POINT] ?? '') ?? [];
    const point = x === undefined || y === undefined ? undefined : { x: Number(x), y: Number(y) };
    return {
      id: message.id,
      title: text.split('\n', 1)[0]!,
      text,
      state,
      ...(by === undefined ? {} : { by }),
      open: OPEN.has(state),
      ...(to === undefined ? {} : { link: to }),
      ...(dropped === undefined ? {} : { dropped }),
      ...(point === undefined ? {} : { point }),
    };
  };
  const listedOf = (
    { message, replies, last }: Summary,
    actors: Awaited<ReturnType<typeof actorsOf>>,
    page: string | undefined,
  ): Listed => {
    const { task, labels } = message;
    const said = task?.blocked?.reason ?? task?.result ?? task?.reason ?? undefined;
    return {
      ...taskOf(message, actors, page),
      ...(labels[AT] === undefined ? {} : { place: labels[AT] }),
      ...(labels['deictic.tag'] === undefined ? {} : { tag: labels['deictic.tag'] }),
      ...(labels['deictic.page'] === undefined ? {} : { page: labels['deictic.page'] }),
      replies,
      ...(last === null ? {} : { last: last.id }),
      ...(said === undefined || said === '' ? {} : { said: clip(said, 2000) }),
    };
  };
  /**
   * The channel's tasks, for the page: those still to do, oldest first, a page of the board's at a time and no more
   * than `PINNED`, then the `OVER` that last ended, the latest first.
   */
  const listed = async (): Promise<Listed[]> => {
    const team = await boardOf();
    const open: Summary[] = [];
    for (let after: string | undefined; open.length < PINNED;) {
      const { tasks, cursor } = await team.tasks.list({ channel, ...(after === undefined ? {} : { after }) });
      open.push(...tasks);
      if (tasks.length === 0 || cursor === after) break;
      after = cursor;
    }
    // By their latest activity, which is how a board answers threads: the newest of each end, then of both.
    const ended = await Promise.all(
      ['completed', 'failed'].map((state) => team.threads({ channel, label: { 'board.task': state }, limit: OVER })),
    );
    const when = ({ message, last }: Summary) => (last ?? message).createdAt;
    const over = ended
      .flatMap(({ threads }) => threads)
      .sort((a, b) => when(b).localeCompare(when(a)))
      .slice(0, OVER);
    const about = [...open, ...over].filter(({ message }) => ours(message));
    const [actors, page] = await Promise.all([
      actorsOf(
        team,
        about.flatMap(({ message }) => message.task?.claim?.actor ?? []),
      ),
      linkOf(),
    ]);
    return about.map((summary) => listedOf(summary, actors, page));
  };
  const replyOf = (message: Message): Reply => ({
    id: message.id,
    by: message.author?.name ?? message.by.actor,
    kind: message.author?.kind ?? 'unknown',
    text: message.text,
    at: message.createdAt,
    files: filesOf(message),
  });
  /** A task of ours with its thread, the newest replies a board answers at once. */
  const threadOf = async (id: string): Promise<Thread> => {
    const team = await boardOf();
    const { message, replies } = await team.thread(id);
    if (message.channel !== channel || !ours(message))
      throw new Refusal(`#${id} isn't a task of deictic's in #${channel}: reload the page for the ones that are`);
    const said = replies.filter((reply) => !reply.deleted);
    const [actors, page] = await Promise.all([actorsOf(team, message.task?.claim ? [message.task.claim.actor] : []), linkOf()]);
    return {
      task: listedOf({ message, replies: said.length, last: said.at(-1) ?? null }, actors, page),
      files: filesOf(message),
      replies: said.map(replyOf),
    };
  };
  /** The task a route's request names, as its last segment, and what it sent. */
  const named = async (req: Request) => {
    const id = decodeURIComponent(new URL(req.url).pathname.split('/').at(-1) ?? '');
    const sent: unknown = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const body = (typeof sent === 'object' && sent !== null ? sent : {}) as Partial<Answer>;
    return { id, text: typeof body.text === 'string' ? body.text : '', body };
  };
  /**
   * A file of a task's, `file/<task>/<file>`: one attached to the task or to a reply in its thread, and to nothing
   * else on the board. An image or a sound is served as it is; anything else as its text, escaped, in a page of the
   * lightbox's dark colours, so an element's HTML is read there, never run, on the dev server's origin.
   */
  const fileOf = async (req: Request): Promise<Response> => {
    const [task = '', file = ''] = (new URL(req.url).pathname.split('/file/')[1] ?? '').split('/').map(decodeURIComponent);
    const team = await boardOf();
    const { message, replies } = await team.thread(task);
    if (message.channel !== channel || !ours(message))
      throw new Refusal(`#${task} isn't a task of deictic's in #${channel}: reload the page for the ones that are`);
    const found = [message, ...replies].flatMap((m) => m.attachments).find((a) => a.id === file);
    if (found === undefined) throw new Refusal(`task ${task} has no file ${file}: reload the page for what it has`);
    const res = await team.download(found.id);
    const media = /^(image|audio|video)\//.test(found.type);
    const body = media ? res.body : textPage(found.name, await res.text());
    return new Response(body, {
      headers: {
        'content-type': media ? found.type : 'text/html; charset=utf-8',
        'content-disposition': `inline; filename="${found.name.replaceAll('"', '')}"`,
        'x-content-type-options': 'nosniff',
        // Its own style and nothing else: no script, no request anywhere.
        'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' blob:; media-src 'self' blob:",
        // A board's file never changes under its ID.
        'cache-control': 'private, max-age=86400, immutable',
      },
    });
  };

  // Kept from `setup`, to `use` another plugin when an op asks for it.  // Kept from `setup`, to `use` another plugin when an op asks for it.
  let context: ServerContext | undefined;
  let project = options.project;
  /**
   * The op with only the screenshots, recordings and voice clips still kept, their files, and what's left out: a file
   * goes once newer ones pass its plugin's `keep`, or `deictic clean` takes it, and that's no reason to lose the task.
   */
  const keptOf = <T extends Attaching>(op: T) => {
    const clipOf = (id: string): ReturnType<Clips['read']> => context?.use('voice')?.read(id);
    // In the op's order, each kind's: the Nth PNG is `deictic.screenshot.N`'s, the Nth recording `deictic.recording.N`'s.
    const files: Upload[] = [];
    const dropped: Kind[] = [];
    const take = (file: Upload | undefined, missing: Kind) => {
      if (file === undefined) dropped.push(missing);
      else files.push(file);
      return file !== undefined;
    };
    const screenshots = (op.screenshots ?? []).filter(({ id }) => take(context?.use('screenshots')?.read(id), 'screenshot'));
    const recordings = (op.recordings ?? []).flatMap((recording) => {
      const found: ReturnType<Recordings['read']> = context?.use('recordings')?.read(recording.id);
      if (!take(found, 'recording')) return [];
      if (recording.voice === undefined) return [recording];
      const clipped = (id: string) => take(clipOf(id), 'voice clip');
      return [{ ...recording, voice: recording.voice.filter(clipped) }];
    });
    const voice = (op.voice ?? []).filter(({ id }) => take(clipOf(id), 'voice note'));
    // Last, and files, not the task's words: there to look into, and most tasks are done without them. What was
    // pointed at is in the element's HTML, and a file of its own only where that isn't attached.
    const html = typeof op.html === 'string' && op.html !== '' ? op.html : undefined;
    if (html !== undefined) files.push({ data: new TextEncoder().encode(html.slice(0, HTML)), name: 'element.html', type: 'text/html' });
    else if (op.pointed !== undefined)
      files.push({ data: new TextEncoder().encode(op.pointed.html.slice(0, HTML)), name: 'pointed.html', type: 'text/html' });
    // The others': the Nth element's is `element.N.html`, the first being the one it's sent on.
    for (const [i, other] of (op.also ?? []).entries()) {
      if (typeof other.html !== 'string' || other.html === '') continue;
      files.push({ data: new TextEncoder().encode(other.html.slice(0, HTML)), name: `element.${i + 2}.html`, type: 'text/html' });
    }
    const kept: T = {
      ...op,
      ...(op.screenshots === undefined ? {} : { screenshots }),
      ...(op.recordings === undefined ? {} : { recordings }),
      ...(op.voice === undefined ? {} : { voice }),
    };
    return { op: kept, files, dropped };
  };
  /** The files uploaded to the board, or nothing when there are none. */
  const upload = async (files: Upload[]): Promise<string[] | undefined> => {
    if (files.length === 0) return undefined;
    const team = await boardOf();
    return Promise.all(files.map(async (file) => (await team.upload(file)).id));
  };

  return definePlugin<Model, Op, Kept>({
    name: 'tasks',
    client: 'deictic/tasks/client',
    packages: ['@vercel/board'],
    // Only where it's turned off: the page half sends the HTML unless told not to.
    ...(options.html === false ? { clientOptions: { html: false } } : {}),
    shortcut: options.shortcut,
    setup: (given) => {
      context = given;
      root = given.root;
      project ??= nameOf(given.root);
      // Started with the dev server, not at the first task, so whoever works the tasks can watch from the start.
      // Not waited for: a failure is the first request's to tell.
      void boardOf().catch(() => {});
    },
    routes: {
      // The channel's tasks, for the page: the drawer lists them, and those with a place are pinned where their
      // elements are.
      page: async () => {
        const [tasks, link] = await Promise.all([asked(listed), linkOf()]);
        return Response.json({ channel, ...(link === undefined ? {} : { link }), tasks });
      },
      // A task and its thread, `thread/<id>`: what the drawer opens.
      thread: async (req) => Response.json(await asked(async () => threadOf((await named(req)).id))),
      // What the drawer does to a task: a reply in its thread, other words for it, or its end, which cancels it
      // on the board. Each answers the thread as it is after.
      // What a task has attached, or a reply in its thread, for the drawer to show.
      file: (req) => asked(() => fileOf(req)),
      reply: (req) =>
        asked(async () => {
          const { id, text, body } = await named(req);
          const answer: Answer = {
            text,
            ...(Array.isArray(body.screenshots) ? { screenshots: body.screenshots } : {}),
            ...(Array.isArray(body.recordings) ? { recordings: body.recordings } : {}),
            ...(Array.isArray(body.voice) ? { voice: body.voice } : {}),
            ...(body.annotations === undefined ? {} : { annotations: body.annotations }),
          };
          if (wordsOf(answer) === '') throw new Refusal('say something first');
          await threadOf(id);
          const { op: kept, files, dropped } = keptOf(answer);
          const verb = dropped.length === 1 ? "isn't" : "aren't";
          if (wordsOf(kept) === '') throw new Refusal(`${listOf(dropped)} ${verb} kept any more: attach again, or say something`);
          // What the files don't say, as a task has it: where each recording replays, the notes drawn.
          const labels = attachedLabels(kept, dropped);
          const attachments = await upload(files);
          await (
            await boardOf()
          ).reply(id, {
            text: clip(wordsOf(kept), 10_000),
            ...(Object.keys(labels).length === 0 ? {} : { labels }),
            ...(attachments === undefined ? {} : { attachments }),
          });
          return Response.json(await threadOf(id));
        }),
      edit: (req) =>
        asked(async () => {
          const { id, text } = await named(req);
          // A task's words are never changed to none.
          if (text.trim() === '') throw new Refusal('say what should change first');
          const before = (await openTask(await boardOf(), id, 'edit')).text;
          // What follows the words in a task added before they were labels (what's attached, what was pointed at) stays.
          const rest = before.includes(REST) ? before.slice(before.indexOf(REST)) : '';
          await rewrite(id, before, clip(text.trim(), 10_000 - rest.length) + rest);
          return Response.json(await threadOf(id));
        }),
      remove: (req) =>
        asked(async () => {
          const { id } = await named(req);
          await cancel(id, 'deleted in deictic');
          return Response.json({});
        }),
    },
    read: (source, target) =>
      asked(async () => {
        const team = await boardOf();
        const labelled = (label: Record<string, string>) => team.tasks.list({ channel, label, state: 'all' });
        // By place too: a task added before there was a `deictic.file` has none, and is still its element's.
        const [here, inFile, page, held] = await Promise.all([
          labelled({ [AT]: atOf(target) }),
          labelled({ [FILE]: clip(target.loc.file, LABEL) }),
          linkOf(),
          team.tasks.list({ channel, state: 'claimed' }),
        ]);
        const listed = new Set(inFile.tasks.map(({ message }) => message.id));
        // Nothing to tell a moved task by where the file has no such element.
        const line = source instanceof Refusal ? undefined : onceIn(source);
        const tasks: Task[] = [];
        const about = [...here.tasks.filter((t) => !listed.has(t.message.id)), ...inFile.tasks];
        // Who has each, and who holds any claim on the channel: asked of the board at once.
        const actorOf = ({ task }: (typeof about)[number]['message']) => task?.claim?.actor;
        const claims = held.tasks.flatMap(({ message }) => message.task?.claim ?? []);
        const actors = await actorsOf(team, [...about.flatMap(({ message }) => actorOf(message) ?? []), ...claims.map((c) => c.actor)]);
        for (const { message } of about) {
          if (message.task?.state === 'canceled') continue;
          const task = taskOf(message, actors, page);
          const at = placeIn(message.labels);
          if (at === undefined || message.labels[AT] === atOf(target)) tasks.push(task);
          else if (line !== undefined && at.tag === target.tag && message.labels['deictic.line'] === line) tasks.push({ ...task, at });
        }
        // An agent at work on a task is here too, though its watch may be over until the task is (`deictic watch --once`).
        const working = agentsOf(actors, claims);
        const watching = [...new Set([...watchersOf(root ?? process.cwd(), channel), ...working])].sort();
        // A board of this machine's own is watched from here or not at all.
        const ours = own !== undefined || (options.board === undefined && process.env.BOARD_URL === undefined);
        return {
          channel,
          ...(page === undefined ? {} : { link: page }),
          ...(watching.length > 0 || ours ? { watching } : {}),
          tasks,
        };
      }),
    apply: (source, target, op) => {
      // A task may go without words where something attached says it.
      if (op.text.trim() === '' && shown(op) === undefined) throw new Refusal('say what should change first');
      const { op: kept, files, dropped } = keptOf(op);
      const verb = dropped.length === 1 ? "isn't" : "aren't";
      if (wordsOf(kept) === '') throw new Refusal(`${listOf(dropped)} ${verb} kept any more: attach again, or say what should change`);
      const labels = {
        ...options.labels,
        ...(project === undefined ? {} : { 'deictic.project': clip(project, LABEL) }),
        ...labelsOf(source, target, kept),
        ...attachedLabels(kept, dropped),
      };
      return asked(async () => {
        const attachments = await upload(files);
        const text = clip(wordsOf(kept), 10_000);
        return { done: await create({ channel, text, labels, ...(attachments === undefined ? {} : { attachments }) }) };
      });
    },
    undo: (record) =>
      asked(async () => {
        if (!('kind' in record)) {
          await cancel(record.id, 'undone in deictic');
          return undefined;
        }
        if (record.kind === 'edited') {
          await rewrite(record.id, record.after, record.before);
          return undefined;
        }
        const { kind, id: _, ...task } = record;
        return { kind, ...(await create(task)) };
      }),
    redo: (record) =>
      asked(async () => {
        if (!('kind' in record)) {
          const { id: _, ...added } = record;
          return create(added);
        }
        if (record.kind === 'edited') {
          await rewrite(record.id, record.before, record.after);
          return record;
        }
        await cancel(record.id, 'deleted in deictic');
        return record;
      }),
    describe: (op) => `task "${clip(wordsOf(op).split('\n', 1)[0]!, 60)}"`,
  });
}

/**
 * The channel's page on a board `vb serve` runs on this machine, which serves its pages beside its API:
 * `/api/board` there, `/c/<channel>` beside it. Nothing for any other board.
 */
async function localPage(team: TaskBoard, channel: string): Promise<string | undefined> {
  const url = new URL((await team.discovery()).url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.pathname.endsWith('/api/board')) return undefined;
  return `${url.origin}${url.pathname.slice(0, -'/api/board'.length)}/c/${channel.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * A file's text as a page to read it in: escaped, so nothing in it runs or loads, in the lightbox's colours, as the
 * browser's own text page is black on nothing and the lightbox is dark under it.
 */
function textPage(name: string, text: string): string {
  const escape = (raw: string) => raw.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const style =
    ':root{color-scheme:dark}body{margin:0;padding:16px;font:12px/1.5 ui-monospace,monospace;color:#e4e4e7;background:#18181b;white-space:pre-wrap;overflow-wrap:anywhere}';
  return `<!doctype html><meta charset="utf-8"><title>${escape(name)}</title><style>${style}</style><body>${escape(text)}`;
}

/** What may be left out of a task as no longer kept, as `deictic.dropped.N` names it. */
type Kind = 'screenshot' | 'recording' | 'voice clip' | 'voice note';

/** What a task or a reply attaches: files, and what the labels say of them. */
type Attaching = Partial<Pick<Op, 'screenshots' | 'recordings' | 'voice' | 'annotations' | 'html' | 'pointed' | 'also'>>;

/**
 * A message's files, as the drawer shows them: each recording with where it replays, which its
 * `deictic.recording.N.replay` label says, the Nth being the Nth recording attached.
 */
function filesOf({ attachments, labels }: Message): Attached[] {
  const recordings = attachments.filter((a) => a.name.startsWith('recording-'));
  return attachments.map(({ id, name, type, size }) => {
    const n = recordings.findIndex((r) => r.id === id);
    const replay = n === -1 ? undefined : labels[`deictic.recording.${n + 1}.replay`];
    return { id, name, type, size, ...(replay === undefined ? {} : { replay }) };
  });
}

/**
 * What the attached files don't say, as labels numbered from 1, so each value is short and none is read out of the
 * text. `deictic.screenshot.N` is the Nth PNG attached: its `.position` and `.size` where the element is in it (CSS
 * pixels from its top left), for one taken of the element, `.note.M` a note drawn on it. `deictic.recording.N.replay` is where the Nth recording
 * plays back; `deictic.note.M` a note drawn on the page; `deictic.dropped.N` what wasn't kept any more;
 * `deictic.pointed` the path to what was pointed at inside the element. A note past a label is cut.
 */
function attachedLabels(op: Attaching, dropped: Kind[]): Record<string, string> {
  const labels: Record<string, string> = {};
  // A board takes no control characters in a label: a note's lines go on one.
  const set = (key: string, value: string) => {
    labels[`deictic.${key}`] = clip(value.replace(/\p{Cc}+/gu, ' '), LABEL);
  };
  for (const [i, { box, marks }] of (op.screenshots ?? []).entries()) {
    const n = `screenshot.${i + 1}`;
    for (const [j, note] of (marks?.notes ?? []).entries()) set(`${n}.note.${j + 1}`, note);
    // One of the window, from the tool panel, says nothing of the element: it may not be in it.
    if (box === undefined) continue;
    const [x, y, width, height] = boxOf(box);
    set(`${n}.position`, `${x},${y}`);
    set(`${n}.size`, `${width}x${height}`);
  }
  for (const [j, note] of (op.annotations?.notes ?? []).entries()) set(`note.${j + 1}`, note);
  for (const [i, { at, tag }] of (op.also ?? []).entries()) set(`also.${i + 1}`, `${at} <${tag}>`);
  // Not cut: half a URL leads nowhere.
  for (const [i, { replay }] of (op.recordings ?? []).entries()) if (replay.length <= LABEL) set(`recording.${i + 1}.replay`, replay);
  for (const [i, kind] of dropped.entries()) set(`dropped.${i + 1}`, kind);
  if (op.pointed !== undefined) set('pointed', op.pointed.path);
  return labels;
}

/**
 * `deictic.source`, `Field (src/Field.tsx:20) ← Panel`: what the element rendered through, out from its own place
 * (`deictic.at`), as the page said it: the components that use it, where the page knows them, or the files around
 * it. As many as a label holds, the farthest left out first.
 */
function sourceOf(chain: NonNullable<Op['chain']>): Record<string, string> {
  let places = chain.slice(0, CHAIN).map(String);
  while (places.length > 1 && places.join(THROUGH).length > LABEL) places = places.slice(0, -1);
  return places.length === 0 ? {} : { 'deictic.source': clip(places.join(THROUGH), LABEL) };
}

const THROUGH = ' ← ';

/** How many places a chain names after the element's own: the first few say which use of a component it is. */
const CHAIN = 3;

/** A box as `x,y,width,height`, in whole CSS pixels from the shot's top left. */
const boxOf = ({ x, y, width, height }: Box) => [x, y, width, height].map(Math.round);

/** What `element.html` holds of an element at most, in characters: a table's rows, not a whole page. */
const HTML = 100_000;

/** A label's value: a board holds 256 characters. */
const LABEL = 256;

/** The project's name: the `name` in the root's `package.json`, or nothing where it has none. */
function nameOf(root: string): string | undefined {
  try {
    const { name } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: unknown };
    return typeof name === 'string' && name !== '' ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The facts about the element, as labels: short values a script reads without parsing the text, and a watch
 * filters by. `deictic.line` is the opening tag's first line as the task saw it, to tell later that it moved.
 * `deictic.url` is the page's whole URL, where a label holds it; `deictic.page` is its path.
 */
function labelsOf(source: Source | Refusal, target: Target, op: Op): Record<string, string> {
  const page = {
    'deictic.page': clip(new URL(op.page).pathname, LABEL),
    ...(op.page.length <= LABEL ? { 'deictic.url': op.page } : {}),
    'deictic.viewport': `${op.viewport.width}x${op.viewport.height}`,
  };
  // With no element attached it's the page's alone: nothing of the one the popup happened to be on.
  if (op.detached === true) return page;
  return {
    [AT]: atOf(target),
    [FILE]: clip(target.loc.file, LABEL),
    'deictic.tag': target.tag,
    // Not where the file has no such element: the task is the page's, and goes without.
    ...(source instanceof Refusal ? {} : { 'deictic.line': clip(lineOf(source), LABEL) }),
    ...page,
    'deictic.count': String(op.count),
    ...(op.point === undefined ? {} : { [POINT]: `${Math.round(op.point.x)},${Math.round(op.point.y)}` }),
    ...sourceOf(op.chain ?? []),
  };
}

/**
 * The actors these IDs name, by ID. An actor's ID isn't read for its name (each board writes them its own way), so
 * the board is asked who they are, and only when there's one to ask about.
 */
async function actorsOf(team: TaskBoard, ids: string[]): Promise<Map<string, Awaited<ReturnType<TaskBoard['actors']>>[number]>> {
  const asked = [...new Set(ids)];
  if (asked.length === 0) return new Map();
  // By ID, which a board from 0.54 answers without listing everyone; an older one lists them all, and the rest go unread.
  return new Map((await team.actors({ id: asked })).map((actor) => [actor.id, actor]));
}

/**
 * The agents holding these claims, by name, while their leases run. A person holding one is left out: they needn't
 * be told they're there. (Whatever else holds one works tasks: an agent, a workflow.)
 */
function agentsOf(actors: Awaited<ReturnType<typeof actorsOf>>, claims: { actor: string; until: string }[]): string[] {
  return claims
    .filter((claim) => Date.parse(claim.until) > Date.now())
    .flatMap((claim) => actors.get(claim.actor) ?? [])
    .filter((actor) => actor.kind !== 'person')
    .map((actor) => actor.name);
}

const atOf = ({ loc }: Target) => `${loc.file}:${loc.line}:${loc.column}`;

/** The opening tag's first line, as written. */
const lineOf = ({ code, element }: Pick<Source, 'code' | 'element'>) => code.slice(element.start, element.end).split('\n', 1)[0]!.trim();

/** The element's line as a label has it, where the file has it once: a line it has twice says nothing of which element a task was about. */
function onceIn(source: Source): string | undefined {
  const line = lineOf(source);
  return source.code.split(line).length === 2 ? clip(line, LABEL) : undefined;
}

/** Where a task says its element is, from its labels. */
function placeIn(labels: Record<string, string>): Place | undefined {
  const [, line, column] = /:(\d+):(\d+)$/.exec(labels[AT] ?? '') ?? [];
  if (line === undefined || column === undefined) return undefined;
  return { line: Number(line), column: Number(column), tag: labels['deictic.tag'] ?? '' };
}

/** The task's words: what was typed, or where nothing was, a line that sends the reader to what's attached. */
const wordsOf = (op: Attaching & Pick<Op, 'text'>) => (op.text.trim() === '' ? (shown(op) ?? '') : op.text.trim());

/** `See the recording and the voice note`: what stands for the words of a task sent with none, where something is attached. */
function shown(op: Attaching): string | undefined {
  const named = (count: number | undefined, word: string) =>
    count === undefined || count === 0 ? [] : [`the ${word}${count === 1 ? '' : 's'}`];
  const attached = [
    ...named(op.screenshots?.length, 'screenshot'),
    ...named(op.recordings?.length, 'recording'),
    ...named(op.voice?.length, 'voice note'),
  ];
  return attached.length === 0 ? undefined : `See ${conjunction(attached)}`;
}

/** `a screenshot and 2 voice notes`, of `deictic.dropped.N`'s values. */
function listOf(kinds: string[]): string {
  return conjunction(
    [...Map.groupBy(kinds, (kind) => kind)].map(([kind, all]) => (all.length === 1 ? `a ${kind}` : `${all.length} ${kind}s`)),
  );
}

const conjunction = (things: string[]) => new Intl.ListFormat('en', { type: 'conjunction' }).format(things);

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** The board's answer, or a `Refusal` saying what to do when there's no board to ask or it said no. */
async function asked<T>(ask: () => Promise<T>): Promise<T> {
  try {
    return await ask();
  } catch (e) {
    if (e instanceof Refusal) throw e;
    const { code, message, hint } = e as { code?: unknown; message?: string; hint?: string };
    if (typeof code === 'string') throw new Refusal(`the board says: ${message}${hint === undefined ? '' : ` (${hint})`}`, { cause: e });
    throw new Refusal(
      `can't reach the board (${message ?? String(e)}): restart the dev server, which starts its own, or check the BOARD_URL or \`board\` it was given`,
      { cause: e },
    );
  }
}

export default tasks;
