/**
 * `deictic/recordings`: records the page with rrweb, for other plugins to attach (tasks does). No tab of
 * its own: `use('recordings').record()` shows a toolbar on the page (drag it to any edge) with annotate
 * mode's tools, where that plugin is loaded, a mic where the voice plugin is, and Stop and Discard. What's drawn while recording is in the
 * recording too, as custom events the replay draws.
 *
 * Recordings are kept under `.deictic/recordings`, the latest `keep`, as JSON: rrweb's
 * events, with the page, its viewport and how long it ran. `replay/<id>` plays one back in the browser.
 *
 * The page sends one as it goes (`begin`, then `part/<id>` each second or so, then `end/<id>` or `discard/<id>`),
 * not whole at the end, so it outlasts the page: after a reload, or a link to another page of the site, the next
 * page carries on with the same recording, which then holds each page in turn.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import type { record } from 'rrweb';

import { definePlugin } from '#src/index.ts';
import type { Masking, ResolvedMasking } from '#src/plugins/screenshots/index.ts';
import { keptIn } from '#src/tools/kept.ts';

import { replayPage } from './replay.ts';

export { MARKS } from './marks.ts';
export { replayPage, type ReplaySources } from './replay.ts';

/** A recording as the page knows it: its ID, where it plays back, and how long it ran, in milliseconds. */
export interface Recording {
  id: string;
  url: string;
  duration: number;
  /** What the mic took while it was on, where the voice plugin is loaded. */
  voice?: VoiceClip[];
}

/** A stretch of the mic in a recording: the voice plugin's clip, and when it starts in the recording, in milliseconds. */
export interface VoiceClip {
  id: string;
  at: number;
  duration: number;
}

/** The page's half, for other plugins' page halves. */
export interface Recorder {
  /**
   * Records the page, with the toolbar, until Stop: answers the recording, kept by the dev server, or
   * nothing when it's discarded. Rejects while another is going, or when it couldn't be kept. A page load
   * doesn't end it: the next page of the site carries on, and `going` there answers what this would have.
   */
  record(): Promise<Recording | undefined>;
  /** Whether one is going. */
  recording(): boolean;
  /** The one going, as `record` answers it: also one a page before this started, carried on here. */
  going(): Promise<Recording | undefined> | undefined;
  /**
   * Ends the one going, as its Stop does (or Discard, with `kept` false), and answers what `record` does: nothing
   * where none is going.
   */
  stop(kept?: boolean): Promise<Recording | undefined> | undefined;
}

/** A plugin of rrweb's own, as its `record` takes them: what puts more than the page in a recording. */
export type RecordPlugin = NonNullable<NonNullable<Parameters<typeof record>[0]>['plugins']>[number];

/**
 * What a plugin that adds to recordings answers in the page, under its name (`logs` and `network` do): the
 * recorder asks each it knows for its rrweb plugin as a recording starts, so nothing listens before, or after it stops.
 */
export interface Recorded {
  /** `sinceLoad`: the recording was going as this page loaded, so what the page did before now is its too. */
  plugin(from: { sinceLoad: boolean }): Promise<RecordPlugin>;
}

/** The server's half, for other plugins' server halves. */
export interface Recordings {
  /** A recording's JSON, or nothing for one not kept (any more). */
  read(id: string): { data: Uint8Array<ArrayBuffer>; name: string; type: 'application/json' } | undefined;
}

/** What a recording says as it begins: all of a `Kept` that's known then. */
export type Meta = Omit<Kept, 'events' | 'duration' | 'voice'>;

/** What's kept: rrweb's events and what they can't say. */
export interface Kept {
  /** The page it started on. One that went on to others has each in its events, as rrweb's own: a `Meta`, then a snapshot. */
  page: string;
  viewport: { width: number; height: number };
  /**
   * The colour scheme the page was in, which rrweb doesn't record: the replay shows it in the same, or a
   * page styled by `prefers-color-scheme` would take the replay's.
   */
  colorScheme?: 'light' | 'dark';
  startedAt: number;
  duration: number;
  events: unknown[];
  /** The mic's clips, played along with the replay. */
  voice?: VoiceClip[];
}

declare module 'deictic' {
  interface ServerApis {
    recordings: Recordings;
  }
  interface ClientApis {
    recordings: Recorder;
  }
}

export interface RecordingsOptions extends Masking {
  /** How many recordings to keep, the latest: 20 by default. */
  keep?: number;
  /** Where they're kept, from the project's root: `.deictic/recordings` by default. */
  dir?: string;
  /**
   * What a `<canvas>` draws (a chart, a map, WebGL), which is no part of the page's markup: a picture of each
   * canvas that changed, `fps` times a second, 2 by default. `false` for none, and a canvas replays blank.
   */
  canvas?: boolean | { fps?: number };
}

const ID = /^[a-z0-9]+-[a-z0-9]+$/;
/** What one recording may weigh: minutes of a busy page are a few MB. */
const MAX = 50 * 1024 * 1024;
/** How long a recording nobody ended keeps its parts, in milliseconds. */
const STALE = 24 * 60 * 60 * 1000;

/** rrweb's player (`rrweb-player`), served to the replay page: its build for a script tag, and its styles. */
const player = (file: string) => {
  try {
    return join(dirname(createRequire(import.meta.url).resolve('rrweb-player')), file);
  } catch {
    // Not installed: `file` answers what to add.
    return '';
  }
};

export function recordings(options: RecordingsOptions = {}) {
  const keep = options.keep ?? 20;
  let dir = '';
  let taken = 0;
  const pathOf = (id: string) => join(dir, `${id}.json`);
  const read: Recordings['read'] = (id) => {
    if (!ID.test(id) || !existsSync(pathOf(id))) return undefined;
    return { data: new Uint8Array(readFileSync(pathOf(id))), name: `recording-${id}.json`, type: 'application/json' };
  };
  const partOf = (id: string) => join(dir, `${id}.part`);
  /** The recording going on that a request names, as its last segment: its ID, or the answer that there's none. */
  const going = (req: Request): string | Response => {
    const id = new URL(req.url).pathname.split('/').at(-1) ?? '';
    if (ID.test(id) && existsSync(partOf(id))) return id;
    return Response.json({ problem: `no recording ${id} is going any more: record again` }, { status: 404 });
  };
  const json = async <T>(req: Request): Promise<T | undefined> => {
    try {
      return (await req.json()) as T;
    } catch {
      return undefined;
    }
  };
  /** A recording begun: its ID, and the file its parts are added to, which starts with what `Kept` says besides the events. */
  const begin = (meta: Meta) => {
    // Sorts by when it was made, which is what pruning keeps by: the count orders two in one millisecond.
    const id = `${Date.now().toString(36).padStart(9, '0')}${(taken++ % 1296).toString(36).padStart(2, '0')}-${crypto.randomUUID().slice(0, 8)}`;
    mkdirSync(dir, { recursive: true });
    // One nobody ended, as its tab was closed: gone a day on.
    for (const f of readdirSync(dir)) if (f.endsWith('.part') && Date.now() - statSync(join(dir, f)).mtimeMs > STALE) rmSync(join(dir, f));

    writeFileSync(partOf(id), `${JSON.stringify(meta)}\n`);
    return id;
  };
  /** The parts as one recording, in their order whatever order they came in: a page's last may overtake the one before. */
  const end = (id: string, last: Pick<Kept, 'duration' | 'voice'>): boolean => {
    const [meta, ...lines] = readFileSync(partOf(id), 'utf8').trimEnd().split('\n');
    const parts = lines.map((line) => JSON.parse(line) as { seq: number; events: unknown[] });
    const events = parts.toSorted((a, b) => a.seq - b.seq).flatMap((part) => part.events);
    rmSync(partOf(id));
    if (events.length === 0) return false;
    const kept: Kept = { ...(JSON.parse(meta!) as Meta), ...last, events };
    writeFileSync(pathOf(id), JSON.stringify(kept));
    const all = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .toSorted();
    for (const old of all.slice(0, Math.max(0, all.length - keep))) rmSync(join(dir, old));
    return true;
  };
  const file = (path: string, type: string) => {
    if (!existsSync(path)) return new Response('rrweb-player is missing: add it to your devDependencies', { status: 404 });
    return new Response(readFileSync(path), { headers: { 'content-type': type } });
  };

  return definePlugin<never, never, never, Recordings>({
    name: 'recordings',
    client: 'deictic/recordings/client',
    packages: ['rrweb', 'rrweb-player'],
    clientOptions: {
      masking: {
        blockClass: options.blockClass ?? 'rr-block',
        blockSelector: options.blockSelector,
        maskTextClass: options.maskTextClass ?? 'rr-mask',
        maskTextSelector: options.maskTextSelector,
        maskAllInputs: options.maskAllInputs ?? false,
      } satisfies ResolvedMasking,
      canvas: options.canvas === false ? false : { fps: (options.canvas === true ? undefined : options.canvas?.fps) ?? 2 },
    },
    setup: ({ root }) => {
      dir = options.dir === undefined ? keptIn(root, 'recordings') : resolve(root, options.dir);
      return { read };
    },
    routes: {
      // A recording starts: the page, its viewport and when. Its events come in parts, as they happen, so a page
      // load in the middle loses none of them, and the next page carries on under the same ID.
      begin: async (req) => {
        const meta = await json<Partial<Meta>>(req);
        if (meta?.viewport === undefined || typeof meta.page !== 'string' || typeof meta.startedAt !== 'number')
          return Response.json({ problem: 'send the page, its viewport and when it started, as JSON' }, { status: 400 });
        const { page, viewport, colorScheme, startedAt } = meta;
        return Response.json({ id: begin({ page, viewport, ...(colorScheme === undefined ? {} : { colorScheme }), startedAt }) });
      },
      // `part/<id>?seq=<n>`: more of its events, a JSON array, and their place among the parts.
      part: async (req) => {
        const id = going(req);
        if (typeof id !== 'string') return id;
        const seq = Number(new URL(req.url).searchParams.get('seq') ?? 'none');
        const events = await json<unknown>(req);
        if (!Array.isArray(events) || !Number.isInteger(seq))
          return Response.json({ problem: 'send the events as a JSON array, and `seq`, their place' }, { status: 400 });
        const line = `${JSON.stringify({ seq, events })}\n`;
        if (statSync(partOf(id)).size + line.length > MAX)
          return Response.json({ problem: `a recording may weigh ${MAX / 1024 / 1024} MB at most: stop this one` }, { status: 413 });
        appendFileSync(partOf(id), line);
        return Response.json({ id });
      },
      // `end/<id>`: it's over, and kept: how long it ran, and the mic's clips.
      end: async (req) => {
        const id = going(req);
        if (typeof id !== 'string') return id;
        const last = await json<Partial<Kept>>(req);
        if (typeof last?.duration !== 'number') return Response.json({ problem: 'send how long it ran, as JSON' }, { status: 400 });
        if (!end(id, { duration: last.duration, ...(last.voice === undefined ? {} : { voice: last.voice }) }))
          return Response.json({ problem: 'the recording has no events: record for a moment longer' }, { status: 400 });
        return Response.json({ id });
      },
      // `discard/<id>`: it's over, and not kept.
      discard: (req) => {
        const id = going(req);
        if (typeof id !== 'string') return id;
        rmSync(partOf(id));
        return Response.json({ id });
      },
      // `recording/<id>`: the JSON, for the replay page.
      recording: (req) => {
        const found = read(new URL(req.url).pathname.split('/').at(-1) ?? '');
        if (found === undefined) return new Response('no such recording, or not kept any more', { status: 404 });
        return new Response(found.data, { headers: { 'content-type': found.type, 'cache-control': 'no-store' } });
      },
      // `replay/<id>`: a page that plays it back.
      replay: () => new Response(replayPage(), { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      'player.js': () => file(player('rrweb-player.umd.min.cjs'), 'text/javascript'),
      'player.css': () => file(player('style.css'), 'text/css'),
    },
  });
}

export default recordings;
