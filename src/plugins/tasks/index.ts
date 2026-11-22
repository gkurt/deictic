/**
 * `deictic/tasks`: open its tab on an element to add a task about it to a Vercel Board
 * (`@vercel/board`). The task says what to change, in the words typed, and where: the element's file,
 * line and tag, the page and the project, all as labels beside the short facts (viewport, how many, where
 * it is in the shot), and after the words what a label can't hold: the chain of source it rendered through, from
 * its own line out to the files that use its component. Its HTML as it rendered is a file attached, `element.html`, for whoever
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

import { definePlugin, Refusal, type ServerContext, type Shortcut, type Source, type Target } from '#src/index.ts';
// For `use('screenshots')`'s type: the plugin may not be loaded, and nothing of it runs here.
import type { Recordings } from '#src/plugins/recordings/index.ts';
import type { Box } from '#src/plugins/screenshots/index.ts';
import type { Clips } from '#src/plugins/voice/index.ts';

import { type LocalBoard, localBoard } from './local.ts';

export { local, type LocalBoard, type LocalOptions } from './local.ts';

/** What the plugin uses of a board: `board()` from `@vercel/board` is one. */
export type TaskBoard = Pick<Board, 'tasks' | 'thread' | 'discovery' | 'upload' | 'edit'>;

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
  /** Whether it can still be edited or deleted: no one has claimed it. */
  open: boolean;
  /** Its page on the board, when there's one to link to. */
  link?: string;
  /**
   * Where it was added, where that isn't the element's place: for one of `tasks`, where the element was before
   * it moved; for one of `elsewhere`, the element it's about.
   */
  at?: Place;
}

/** A place in the element's file: a line and a column, from 1, and the tag there as the task saw it. */
export interface Place {
  line: number;
  column: number;
  tag: string;
}

export interface Model {
  channel: string;
  /** The channel's page, when there's one to link to. */
  link?: string;
  /** Tasks about this element, oldest first, canceled ones left out: also those added before it moved. */
  tasks: Task[];
  /** Tasks about the file's other elements, by line, canceled ones left out: each with its `at`. */
  elsewhere: Task[];
}

/**
 * What the Task tab asks for: a new task (an `Op`), other words for one it lists (`edit` is its ID), or
 * that one deleted (`remove` is its ID), which cancels it on the board.
 */
export type Change = Op | { edit: string; text: string } | { remove: string };

/** A new task: what the page knows and the source doesn't. */
export interface Op {
  text: string;
  /** The page's URL. */
  page: string;
  viewport: { width: number; height: number };
  /**
   * What was under the pointer inside the element, where nothing marked it (a dependency's markup, or a
   * shadow root's): its path from the element, and its HTML, cut short.
   */
  pointed?: { path: string; html: string };
  /** How many elements on the page come from the same place in the source. */
  count: number;
  /**
   * The source it rendered through, after its own place, nearest first, each a `file:line`: where the file
   * before it is used. A shared component's line says nothing of which use of it this is, and these do.
   */
  chain?: string[];
  /** The element's HTML as it rendered, to attach: cut short, and masked where the screenshots plugin is loaded. */
  html?: string;
  /**
   * Shots the screenshots plugin took of it, to attach, where that plugin is loaded: each with where the
   * element is in it, whether it's `outlined` there (dashes drawn around it, in the PNG), and the marks drawn
   * on it in the panel, where there are any.
   */
  screenshots?: { id: string; box: Box; outlined?: boolean; marks?: Marks }[];
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

/** A task's words changed: its message's whole text before and after. */
export interface Edited {
  kind: 'edited';
  id: string;
  before: string;
  after: string;
}

/**
 * A task deleted in the panel: canceled on the board, for good, as a board has it. So it's kept whole, and
 * an undo adds it again, as a new task whose ID the record then has.
 */
export interface Removed extends Added {
  kind: 'removed';
}

/** What the history keeps of a change: a task added has no `kind`, as it had none before there were others. */
export type Kept = Added | Edited | Removed;

const AT = 'deictic.at';
const FILE = 'deictic.file';
/** What parts what was typed from the rest of a task's text. */
const REST = '\n---\n';
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
  const openTask = async (team: TaskBoard, id: string, verb: string) => {
    const { message } = await team.thread(id);
    if (message.channel !== channel || message.labels[AT] === undefined)
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

  // Kept from `setup`, to `use` another plugin when an op asks for it.
  let context: ServerContext | undefined;
  let project = options.project;
  /** The screenshots, recordings and the element's HTML to attach, uploaded to the board, or nothing when there are none. */
  const attach = async (op: Op): Promise<string[] | undefined> => {
    // All read first, so one no longer kept uploads none.
    const files = [
      ...(op.screenshots ?? []).map(({ id }) => {
        const shot = context?.use('screenshots')?.read(id);
        if (shot === undefined) throw new Refusal(`screenshot ${id} isn't kept any more: take it again`);
        return shot;
      }),
      ...(op.recordings ?? []).map(({ id }) => {
        const recording: ReturnType<Recordings['read']> = context?.use('recordings')?.read(id);
        if (recording === undefined) throw new Refusal(`recording ${id} isn't kept any more: record it again`);
        return recording;
      }),
      ...[...(op.recordings ?? []).flatMap((r) => r.voice ?? []), ...(op.voice ?? []).map((v) => v.id)].map((id) => {
        const clip: ReturnType<Clips['read']> = context?.use('voice')?.read(id);
        if (clip === undefined) throw new Refusal(`voice clip ${id} isn't kept any more: record it again`);
        return clip;
      }),
      // Last, and a file, not the task's words: it's there to look into, and most tasks are done without it.
      ...(typeof op.html !== 'string' || op.html === ''
        ? []
        : [{ data: new TextEncoder().encode(op.html.slice(0, HTML)), name: 'element.html', type: 'text/html' }]),
    ];
    if (files.length === 0) return undefined;
    const team = await boardOf();
    return Promise.all(files.map(async (file) => (await team.upload(file)).id));
  };

  return definePlugin<Model, Change, Kept>({
    name: 'tasks',
    client: 'deictic/tasks/client',
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
    read: (source, target) =>
      asked(async () => {
        const team = await boardOf();
        const labelled = (label: Record<string, string>) => team.tasks.list({ channel, label, state: 'all' });
        // By place too: a task added before there was a `deictic.file` has none, and is still its element's.
        const [here, inFile, page] = await Promise.all([
          labelled({ [AT]: atOf(target) }),
          labelled({ [FILE]: clip(target.loc.file, LABEL) }),
          linkOf(),
        ]);
        const listed = new Set(inFile.tasks.map(({ message }) => message.id));
        const line = lineOf(source);
        // A line the file has twice says nothing of which element a task was about.
        const once = source.code.split(line).length === 2;
        const tasks: Task[] = [];
        const elsewhere: (Task & { at: Place })[] = [];
        for (const { message } of [...here.tasks.filter((t) => !listed.has(t.message.id)), ...inFile.tasks]) {
          const state = message.task?.state ?? 'ready';
          if (state === 'canceled') continue;
          const text = message.text.split(REST, 1)[0]!;
          const to = taskLink(page, message.id);
          const task = {
            id: message.id,
            title: text.split('\n', 1)[0]!,
            text,
            state,
            open: OPEN.has(state),
            ...(to === undefined ? {} : { link: to }),
          };
          const at = placeIn(message.labels);
          if (at === undefined || message.labels[AT] === atOf(target)) tasks.push(task);
          else if (once && at.tag === target.tag && message.labels['deictic.line'] === clip(line, LABEL)) tasks.push({ ...task, at });
          else elsewhere.push({ ...task, at });
        }
        return {
          channel,
          ...(page === undefined ? {} : { link: page }),
          tasks,
          // The board's order (oldest first) among those of one place.
          elsewhere: elsewhere.sort((a, b) => (a.at.line === b.at.line ? a.at.column - b.at.column : a.at.line - b.at.line)),
        };
      }),
    apply: (source, target, op) => {
      if ('remove' in op) {
        return asked(async () => {
          const message = await cancel(op.remove, 'deleted in deictic');
          // The board's own labels (`board.task`) are its to set on the task an undo adds.
          const labels = Object.fromEntries(Object.entries(message.labels).filter(([key]) => !key.startsWith('board.')));
          const attachments = message.attachments.map((a) => a.id);
          const kept = { channel, id: op.remove, text: message.text, labels, ...(attachments.length === 0 ? {} : { attachments }) };
          return { done: { kind: 'removed' as const, ...kept } };
        });
      }
      // A new task may go without words where something attached says it; a task's words are never changed to none.
      if (op.text.trim() === '' && ('edit' in op || shown(op) === undefined)) throw new Refusal('say what should change first');
      if ('edit' in op) {
        return asked(async () => {
          const before = (await openTask(await boardOf(), op.edit, 'edit')).text;
          // What follows the words (what's attached, what was pointed at) stays as it was.
          const rest = before.includes(REST) ? before.slice(before.indexOf(REST)) : '';
          const after = clip(op.text.trim(), 10_000 - rest.length) + rest;
          await rewrite(op.edit, before, after);
          return { done: { kind: 'edited' as const, id: op.edit, before, after } };
        });
      }
      const labels = {
        ...options.labels,
        ...(project === undefined ? {} : { 'deictic.project': clip(project, LABEL) }),
        ...labelsOf(source, target, op),
      };
      return asked(async () => {
        const attachments = await attach(op);
        return {
          done: await create({ channel, text: textOf(op, target), labels, ...(attachments === undefined ? {} : { attachments }) }),
        };
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
    describe: (op, before) => {
      const named = (id: string) => `task "${clip(before.tasks.find((t) => t.id === id)?.title ?? `#${id}`, 60)}"`;
      if ('remove' in op) return `delete ${named(op.remove)}`;
      if ('edit' in op) return `edit ${named(op.edit)}`;
      return `task "${clip(wordsOf(op).split('\n', 1)[0]!, 60)}"`;
    },
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

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const said = (notes: string[]) => (notes.length === 0 ? '' : `; the notes say: ${notes.map((n) => JSON.stringify(n)).join(', ')}`);

/** What was marked on the page: how many marks, and what the notes say. */
function annotated({ count, notes }: Marks, shots: number, recordings: number): string {
  const where = [
    ...(shots === 0 ? [] : [shots === 1 ? 'the screenshot' : 'the screenshots']),
    ...(recordings === 0 ? [] : [recordings === 1 ? 'the recording' : 'the recordings']),
  ];
  const drawn = where.length === 0 ? '' : `, drawn in ${where.join(' and ')}`;
  return `${plural(count, 'mark')} on the page${drawn}${said(notes)}`;
}

/** How long each recording ran, and where it plays back, while the dev server keeps it. */
function recordingsOf(recordings: NonNullable<Op['recordings']>): string[] {
  return recordings.map(({ duration, replay, voice }, i) => {
    const name = recordings.length === 1 ? 'A recording' : `Recording ${i + 1}`;
    const spoken = voice === undefined || voice.length === 0 ? '' : `, with the voice (${voice.map((id) => `voice-${id}`).join(', ')})`;
    return `${name}, ${clock(duration)} long, attached as rrweb events${spoken}; it replays at ${replay}`;
  });
}

/** How long each voice note runs, and the attachment it's in. */
function voicesOf(voice: NonNullable<Op['voice']>): string[] {
  return voice.map(({ id, duration }, i) => {
    const name = voice.length === 1 ? 'A voice note' : `Voice note ${i + 1}`;
    return `${name}, ${clock(duration)} long, attached as voice-${id}`;
  });
}

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * What's drawn on each shot (the element's outline, the person's marks), and with several, where the element is
 * in each. One shot's place is the `deictic.position` and `deictic.size` labels, so a shot with nothing drawn
 * on it has no line.
 */
function shotsOf(shots: NonNullable<Op['screenshots']>): string[] {
  const [only] = shots;
  if (shots.length === 1 && only !== undefined) {
    const { marks, outlined } = only;
    const has = [
      ...(outlined === true ? ['the element outlined in dashes'] : []),
      ...(marks === undefined || marks.count === 0 ? [] : [`${plural(marks.count, 'mark')} drawn on it${said(marks.notes)}`]),
    ];
    return has.length === 0 ? [] : [`The screenshot has ${has.join(' and ')}`];
  }
  return shots.map(({ box, marks, outlined }, i) => {
    const drawn = marks === undefined || marks.count === 0 ? '' : `, with ${plural(marks.count, 'mark')} drawn on it${said(marks.notes)}`;
    const [x, y, width, height] = boxOf(box);
    return `In screenshot ${i + 1} at x ${x}, y ${y}, ${width}×${height}${outlined === true ? ', outlined in dashes' : ''}${drawn}`;
  });
}

/** `Source: src/ui/label.tsx:6 ← src/Field.tsx:20 ← src/Panel.tsx:880`: from the element's line out, as the page said it. */
function chainOf({ loc }: Target, chain: NonNullable<Op['chain']>): string[] {
  const places = chain.slice(0, CHAIN).map((place) => clip(String(place), LABEL));
  return places.length === 0 ? [] : [`Source: ${[`${loc.file}:${loc.line}`, ...places].join(' ← ')}`];
}

/** How many places a chain names after the element's own: the first few say which use of a component it is. */
const CHAIN = 5;

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
 * `deictic.url` is the page's whole URL, where a label holds it: `textOf` says a longer one.
 */
function labelsOf({ code, element }: Source, target: Target, op: Op): Record<string, string> {
  const [shot] = op.screenshots ?? [];
  return {
    [AT]: atOf(target),
    [FILE]: clip(target.loc.file, LABEL),
    'deictic.tag': target.tag,
    'deictic.line': clip(lineOf({ code, element }), LABEL),
    'deictic.page': clip(new URL(op.page).pathname, LABEL),
    ...(op.page.length <= LABEL ? { 'deictic.url': op.page } : {}),
    'deictic.viewport': `${op.viewport.width}x${op.viewport.height}`,
    'deictic.count': String(op.count),
    ...(op.screenshots?.length === 1 && shot !== undefined ? placeOf(shot.box) : {}),
  };
}

/** Where the element is in the one shot, from its top left, and how big: `87,387` and `138x32`, as the viewport is written. */
function placeOf(box: Box): Record<string, string> {
  const [x, y, width, height] = boxOf(box);
  return { 'deictic.position': `${x},${y}`, 'deictic.size': `${width}x${height}` };
}

const atOf = ({ loc }: Target) => `${loc.file}:${loc.line}:${loc.column}`;

/** The opening tag's first line, as written. */
const lineOf = ({ code, element }: Pick<Source, 'code' | 'element'>) => code.slice(element.start, element.end).split('\n', 1)[0]!.trim();

/** Where a task says its element is, from its labels. */
function placeIn(labels: Record<string, string>): Place | undefined {
  const [, line, column] = /:(\d+):(\d+)$/.exec(labels[AT] ?? '') ?? [];
  if (line === undefined || column === undefined) return undefined;
  return { line: Number(line), column: Number(column), tag: labels['deictic.tag'] ?? '' };
}

/**
 * The task's text: what was typed, and after a `---` only what no label holds: what's attached and drawn, the
 * source it rendered through, what was pointed at inside it, and a URL too long for a label.
 * A board holds 10,000 characters.
 */
function textOf(op: Op, target: Target): string {
  const more = [
    ...(op.page.length <= LABEL ? [] : [op.page]),
    ...shotsOf(op.screenshots ?? []),
    ...recordingsOf(op.recordings ?? []),
    ...voicesOf(op.voice ?? []),
    ...(op.annotations === undefined ? [] : [annotated(op.annotations, op.screenshots?.length ?? 0, op.recordings?.length ?? 0)]),
    ...chainOf(target, op.chain ?? []),
    ...(op.pointed === undefined ? [] : [`Pointed at, inside it: \`${op.pointed.path}\``, fence(op.pointed.html, 'html')]),
  ];
  const tail = more.length === 0 ? '' : REST + more.join('\n');
  return clip(wordsOf(op), 10_000 - tail.length) + tail;
}

/** The task's words: what was typed, or where nothing was, a line that sends the reader to what's attached. */
const wordsOf = (op: Op) => (op.text.trim() === '' ? (shown(op) ?? '') : op.text.trim());

/** `See the recording and the voice note`: what stands for the words of a task sent with none, where something is attached. */
function shown(op: Op): string | undefined {
  const named = (count: number | undefined, word: string) =>
    count === undefined || count === 0 ? [] : [`the ${word}${count === 1 ? '' : 's'}`];
  const attached = [
    ...named(op.screenshots?.length, 'screenshot'),
    ...named(op.recordings?.length, 'recording'),
    ...named(op.voice?.length, 'voice note'),
  ];
  return attached.length === 0 ? undefined : `See ${new Intl.ListFormat('en', { type: 'conjunction' }).format(attached)}`;
}

const fence = (text: string, lang: string) => `\`\`\`\`${lang}\n${clip(text, 1500)}\n\`\`\`\``;

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
