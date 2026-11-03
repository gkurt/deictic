/**
 * `deictic/recordings`: records the page with rrweb, for other plugins to attach (tasks does). No tab of
 * its own: `use('recordings').record()` shows a toolbar on the page (drag it to any edge) with annotate
 * mode's tools, where that plugin is loaded, a mic where the voice plugin is, and Stop and Discard. What's drawn while recording is in the
 * recording too, as custom events the replay draws.
 *
 * Recordings are kept under `.deictic/recordings`, the latest `keep`, as JSON: rrweb's
 * events, with the page, its viewport and how long it ran. `replay/<id>` plays one back in the browser.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { definePlugin } from '#src/index.ts';
import type { Masking, ResolvedMasking } from '#src/plugins/screenshots/index.ts';
import { keptIn } from '#src/tools/kept.ts';

import { REPLAY } from './replay.ts';

export { MARKS } from './marks.ts';

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
   * nothing when it's discarded. Rejects while another is going, or when it couldn't be kept.
   */
  record(): Promise<Recording | undefined>;
  /** Whether one is going. */
  recording(): boolean;
}

/** The server's half, for other plugins' server halves. */
export interface Recordings {
  /** A recording's JSON, or nothing for one not kept (any more). */
  read(id: string): { data: Uint8Array<ArrayBuffer>; name: string; type: 'application/json' } | undefined;
}

/** What the page sends, and what's kept: rrweb's events and what they can't say. */
export interface Kept {
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
}

const ID = /^[a-z0-9]+-[a-z0-9]+$/;
/** What one recording may weigh: minutes of a busy page are a few MB. */
const MAX = 50 * 1024 * 1024;

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
  const keepRecording = (data: Uint8Array) => {
    // Sorts by when it was made, which is what pruning keeps by: the count orders two in one millisecond.
    const id = `${Date.now().toString(36).padStart(9, '0')}${(taken++ % 1296).toString(36).padStart(2, '0')}-${crypto.randomUUID().slice(0, 8)}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(pathOf(id), data);
    const kept = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .toSorted();
    for (const old of kept.slice(0, Math.max(0, kept.length - keep))) rmSync(join(dir, old));
    return id;
  };
  const file = (path: string, type: string) => {
    if (!existsSync(path)) return new Response('rrweb-player is missing: add it to your devDependencies', { status: 404 });
    return new Response(readFileSync(path), { headers: { 'content-type': type } });
  };

  return definePlugin<never, never, never, Recordings>({
    name: 'recordings',
    client: 'deictic/recordings/client',
    clientOptions: {
      masking: {
        blockClass: options.blockClass ?? 'rr-block',
        blockSelector: options.blockSelector,
        maskTextClass: options.maskTextClass ?? 'rr-mask',
        maskTextSelector: options.maskTextSelector,
        maskAllInputs: options.maskAllInputs ?? false,
      } satisfies ResolvedMasking,
    },
    setup: ({ root }) => {
      dir = options.dir === undefined ? keptIn(root, 'recordings') : resolve(root, options.dir);
      return { read };
    },
    routes: {
      // What the page recorded, as JSON.
      add: async (req) => {
        if (!(req.headers.get('content-type') ?? '').startsWith('application/json'))
          return Response.json({ problem: 'send the recording as application/json' }, { status: 415 });
        const body = new Uint8Array(await req.arrayBuffer());
        if (body.byteLength > MAX)
          return Response.json({ problem: `a recording may weigh ${MAX / 1024 / 1024} MB at most` }, { status: 413 });
        let kept: Partial<Kept>;
        try {
          kept = JSON.parse(new TextDecoder().decode(body)) as Partial<Kept>;
        } catch {
          return Response.json({ problem: "the recording isn't JSON" }, { status: 400 });
        }
        if (!Array.isArray(kept.events) || kept.events.length === 0)
          return Response.json({ problem: 'the recording has no events: record for a moment longer' }, { status: 400 });
        return Response.json({ id: keepRecording(body) });
      },
      // `recording/<id>`: the JSON, for the replay page.
      recording: (req) => {
        const found = read(new URL(req.url).pathname.split('/').at(-1) ?? '');
        if (found === undefined) return new Response('no such recording, or not kept any more', { status: 404 });
        return new Response(found.data, { headers: { 'content-type': found.type, 'cache-control': 'no-store' } });
      },
      // `replay/<id>`: a page that plays it back.
      replay: () => new Response(REPLAY, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      'player.js': () => file(player('rrweb-player.umd.min.cjs'), 'text/javascript'),
      'player.css': () => file(player('style.css'), 'text/css'),
    },
  });
}

export default recordings;
