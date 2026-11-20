/**
 * `deictic/tasks`: open its tab on an element to add a task about it to a Vercel Board
 * (`@vercel/board`). The task says what to change, in the words typed, and where: the element's file,
 * line and tag, and the page. The short facts beside them (viewport, how many, where it is in the shot)
 * are labels. Whatever works the board's tasks (a person, or an agent of theirs claiming them) takes it
 * from there; deictic only adds them.
 *
 * Adding one is a change like any other: undo cancels the task, while no one has claimed it, and redo
 * adds it again, as a new task. Each task carries `deictic.at=<file:line:column>`, so the panel
 * lists the ones about the element clicked, until its line moves.
 */
import type { Board } from '@vercel/board';

import { definePlugin, Refusal, type ServerContext, type Shortcut, type Source, type Target } from '#src/index.ts';
// For `use('screenshots')`'s type: the plugin may not be loaded, and nothing of it runs here.
import type { Recordings } from '#src/plugins/recordings/index.ts';
import type { Box } from '#src/plugins/screenshots/index.ts';
import type { Clips } from '#src/plugins/voice/index.ts';

/** What the plugin uses of a board: `board()` from `@vercel/board` is one. */
export type TaskBoard = Pick<Board, 'tasks' | 'thread' | 'discovery' | 'upload'>;

export interface TasksOptions {
  /**
   * The board, as `@vercel/board`'s `board()` answers it: by default the one `BOARD_URL` names (`npx vb serve`
   * runs one on this machine), or your team's default board, through `vercel login`.
   */
  board?: TaskBoard;
  /** The channel tasks go to: `deictic` by default. */
  channel?: string;
  /** Labels every task gets besides deictic's own, for whoever works them to filter by (`vb tail --label`). None by default. */
  labels?: Record<string, string>;
  /**
   * Where the panel links the channel to, for a person to see its tasks. By default the board's own page
   * when it's one `vb serve` runs on this machine (`http://127.0.0.1:4100/c/deictic`), and none for
   * another board, whose pages deictic can't know.
   */
  link?: (channel: string) => string | undefined;
  /** What opens its tab directly, beside deictic's own shortcut, which opens any: none by default. */
  shortcut?: Shortcut;
}

export interface Task {
  id: string;
  /** The first line of what was typed. */
  title: string;
  state: string;
}

export interface Model {
  channel: string;
  /** The channel's page, when there's one to link to. */
  link?: string;
  /** Tasks about this element, oldest first, canceled ones left out. */
  tasks: Task[];
}

/** What the page knows and the source doesn't. */
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
   * Shots the screenshots plugin took of it, to attach, where that plugin is loaded: each with where the
   * element is in it, and the marks drawn on it in the panel, where there are any.
   */
  screenshots?: { id: string; box: Box; marks?: Marks }[];
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

const AT = 'deictic.at';
const OPEN = new Set(['waiting', 'ready', 'blocked']);

export function tasks(options: TasksOptions = {}) {
  const channel = options.channel ?? 'deictic';
  let team: Promise<TaskBoard> | undefined;
  // Loaded when first used, so a project that doesn't add this plugin needn't install the SDK.
  const boardOf = () => (team ??= options.board ? Promise.resolve(options.board) : import('@vercel/board').then((m) => m.board()));
  let link: Promise<string | undefined> | undefined;
  // Asked once, unless asking failed: no link is no reason to keep the panel from showing the tasks.
  const linkOf = () =>
    (link ??= (options.link ? Promise.resolve(options.link(channel)) : boardOf().then((b) => localPage(b, channel))).catch(() => {
      link = undefined;
      return undefined;
    }));
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
  /** The screenshots and recordings to attach, uploaded to the board, or nothing when there are none. */
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
    ];
    if (files.length === 0) return undefined;
    const team = await boardOf();
    return Promise.all(files.map(async (file) => (await team.upload(file)).id));
  };

  return definePlugin<Model, Op, Added>({
    name: 'tasks',
    client: 'deictic/tasks/client',
    shortcut: options.shortcut,
    setup: (given) => {
      context = given;
    },
    read: (_source, target) =>
      asked(async () => {
        const [{ tasks: found }, page] = await Promise.all([
          (await boardOf()).tasks.list({ channel, label: { [AT]: atOf(target) }, state: 'all' }),
          linkOf(),
        ]);
        return {
          channel,
          ...(page === undefined ? {} : { link: page }),
          tasks: found
            .map(({ message }) => ({ id: message.id, title: message.text.split('\n', 1)[0]!, state: message.task?.state ?? 'ready' }))
            .filter((t) => t.state !== 'canceled'),
        };
      }),
    apply: (source, target, op) => {
      if (op.text.trim() === '') throw new Refusal('say what should change first');
      const labels = { ...options.labels, ...labelsOf(source, target, op) };
      return asked(async () => {
        const attachments = await attach(op);
        return {
          done: await create({ channel, text: textOf(target, op), labels, ...(attachments === undefined ? {} : { attachments }) }),
        };
      });
    },
    undo: ({ id }) =>
      asked(async () => {
        const team = await boardOf();
        const { task } = (await team.thread(id)).message;
        if (task !== undefined && !OPEN.has(task.state)) {
          throw new Refusal(
            `task ${id} is ${task.state}${task.claim ? ` by ${task.claim.actor}` : ''} now: cancel it on the board if you still mean to`,
          );
        }
        await team.tasks.cancel(id, 'undone in deictic');
      }),
    redo: ({ id: _, ...record }) => asked(() => create(record)),
    describe: ({ text }) => `task "${clip(text.trim().split('\n', 1)[0]!, 60)}"`,
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
 * What was drawn on each shot, and with several, where the element is in each: nothing marks it there. One
 * shot's place is the `deictic.box` label, so a shot with no marks has no line.
 */
function shotsOf(shots: NonNullable<Op['screenshots']>): string[] {
  const [only] = shots;
  if (shots.length === 1 && only !== undefined) {
    const { marks } = only;
    return marks === undefined || marks.count === 0
      ? []
      : [`The screenshot has ${plural(marks.count, 'mark')} drawn on it${said(marks.notes)}`];
  }
  return shots.map(({ box, marks }, i) => {
    const drawn = marks === undefined || marks.count === 0 ? '' : `, with ${plural(marks.count, 'mark')} drawn on it${said(marks.notes)}`;
    const [x, y, width, height] = boxOf(box);
    return `In screenshot ${i + 1} at x ${x}, y ${y}, ${width}×${height}${drawn}`;
  });
}

/** A box as `x,y,width,height`, in whole CSS pixels from the shot's top left. */
const boxOf = ({ x, y, width, height }: Box) => [x, y, width, height].map(Math.round);

/** A label's value: a board holds 256 characters. */
const LABEL = 256;

/**
 * The facts about the element, as labels: short values a script reads without parsing the text, and a watch
 * filters by. `deictic.line` is the opening tag's first line as the task saw it, to tell later that it moved.
 */
function labelsOf({ code, element }: Source, target: Target, op: Op): Record<string, string> {
  const [shot] = op.screenshots ?? [];
  return {
    [AT]: atOf(target),
    'deictic.tag': target.tag,
    'deictic.line': clip(code.slice(element.start, element.end).split('\n', 1)[0]!.trim(), LABEL),
    'deictic.page': clip(new URL(op.page).pathname, LABEL),
    'deictic.viewport': `${op.viewport.width}x${op.viewport.height}`,
    'deictic.count': String(op.count),
    ...(op.screenshots?.length === 1 && shot !== undefined ? { 'deictic.box': boxOf(shot.box).join(',') } : {}),
  };
}

const atOf = ({ loc }: Target) => `${loc.file}:${loc.line}:${loc.column}`;

/**
 * The task's text: what was typed, then where and what's attached, for a person reading the board. The rest
 * is in the labels, and the source is in the file. A board holds 10,000 characters.
 */
function textOf(target: Target, op: Op): string {
  const tail = [
    '',
    '---',
    `\`${atOf(target)}\` · \`<${target.tag}>\``,
    op.page,
    ...shotsOf(op.screenshots ?? []),
    ...recordingsOf(op.recordings ?? []),
    ...voicesOf(op.voice ?? []),
    ...(op.annotations === undefined ? [] : [annotated(op.annotations, op.screenshots?.length ?? 0, op.recordings?.length ?? 0)]),
    ...(op.pointed === undefined ? [] : [`Pointed at, inside it: \`${op.pointed.path}\``, fence(op.pointed.html, 'html')]),
  ].join('\n');
  return clip(op.text.trim(), 10_000 - tail.length) + tail;
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
      `can't reach the board (${message ?? String(e)}): run \`npx vb serve\` and set BOARD_URL for the dev server, or \`vercel login\``,
      { cause: e },
    );
  }
}

export default tasks;
