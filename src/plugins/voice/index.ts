/**
 * `deictic/voice`: records the mic, for other plugins to attach (tasks does) or play along with
 * something (a recording does). No tab of its own. The page half asks for the mic the first time, records
 * with `MediaRecorder` and sends each take as it's spoken, its start to the `add` route and the rest to
 * `more/<id>`, so one a page load cuts short is kept up to there; the server half keeps the latest `keep`
 * clips under `.deictic/voice` and serves them at `clip/<id>`.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { definePlugin } from '#src/index.ts';
import { keptIn } from '#src/tools/kept.ts';

/** A clip as the page knows it: its ID, where it plays from, how long it runs in milliseconds, and its type. */
export interface Clip {
  id: string;
  url: string;
  duration: number;
  type: string;
}

/** A take going on: `stop` ends it and answers its clip, `cancel` ends it with none (what was sent of it goes as the oldest clips do). */
export interface Take {
  /** When it started, as `Date.now()`. */
  started: number;
  /** The mic, while it's recorded: to show it's heard (`liveWaveform` from `deictic/client`). */
  stream: MediaStream;
  /**
   * What's kept of it by now, as the clip it would be if it ended here, or nothing before its first second is:
   * for a page that's going, with no time left to `stop` it.
   */
  soFar(): Pick<Clip, 'id' | 'duration'> | undefined;
  stop(): Promise<Clip>;
  cancel(): void;
}

/** The page's half, for other plugins' page halves. */
export interface Voice {
  /** Starts recording the mic, asking for it the first time: rejects when it's refused or there's none. */
  start(): Promise<Take>;
}

/** The server's half, for other plugins' server halves. */
export interface Clips {
  /** A clip's audio, or nothing for one not kept (any more). */
  read(id: string): { data: Uint8Array<ArrayBuffer>; name: string; type: string } | undefined;
}

declare module 'deictic' {
  interface ServerApis {
    voice: Clips;
  }
  interface ClientApis {
    voice: Voice;
  }
}

export interface VoiceOptions {
  /** How many clips to keep, the latest: 50 by default. */
  keep?: number;
  /** Where they're kept, from the project's root: `.deictic/voice` by default. */
  dir?: string;
}

const ID = /^[a-z0-9]+-[a-z0-9]+$/;
/** What one clip may weigh: minutes of speech in Opus are well under a MB. */
const MAX = 25 * 1024 * 1024;
/** The audio a browser's `MediaRecorder` makes, by the extension it's kept under. */
const TYPES: Record<string, string> = { webm: 'audio/webm', ogg: 'audio/ogg', mp4: 'audio/mp4' };

export function voice(options: VoiceOptions = {}) {
  const keep = options.keep ?? 50;
  let dir = '';
  let taken = 0;
  const fileOf = (id: string) => (ID.test(id) && existsSync(dir) ? readdirSync(dir).find((f) => f.startsWith(`${id}.`)) : undefined);
  const read: Clips['read'] = (id) => {
    const file = fileOf(id);
    if (file === undefined) return undefined;
    const ext = file.slice(id.length + 1);
    return { data: new Uint8Array(readFileSync(join(dir, file))), name: `voice-${file}`, type: TYPES[ext] ?? 'application/octet-stream' };
  };
  const keepClip = (data: Uint8Array, ext: string) => {
    // Sorts by when it was made, which is what pruning keeps by: the count orders two in one millisecond.
    const id = `${Date.now().toString(36).padStart(9, '0')}${(taken++ % 1296).toString(36).padStart(2, '0')}-${crypto.randomUUID().slice(0, 8)}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}.${ext}`), data);
    const kept = readdirSync(dir).toSorted();
    for (const old of kept.slice(0, Math.max(0, kept.length - keep))) rmSync(join(dir, old));
    return id;
  };

  return definePlugin<never, never, never, Clips>({
    name: 'voice',
    client: 'deictic/voice/client',
    setup: ({ root }) => {
      dir = options.dir === undefined ? keptIn(root, 'voice') : resolve(root, options.dir);
      return { read };
    },
    routes: {
      // A take the page is recording, as the audio type its `MediaRecorder` makes: its start, the rest to `more`.
      add: async (req) => {
        const type = (req.headers.get('content-type') ?? '').split(';')[0]!.trim();
        const ext = Object.keys(TYPES).find((e) => TYPES[e] === type);
        if (ext === undefined) return Response.json({ problem: `send the clip as ${Object.values(TYPES).join(', ')}` }, { status: 415 });
        const body = new Uint8Array(await req.arrayBuffer());
        if (body.byteLength === 0) return Response.json({ problem: 'the clip is empty: speak for a moment longer' }, { status: 400 });
        if (body.byteLength > MAX) return Response.json({ problem: `a clip may weigh ${MAX / 1024 / 1024} MB at most` }, { status: 413 });
        return Response.json({ id: keepClip(body, ext) });
      },
      // `more/<id>`: the take goes on, and this is the next of its audio. With `?last`, and maybe nothing, it's over.
      more: async (req) => {
        const id = new URL(req.url).pathname.split('/').at(-1) ?? '';
        const file = fileOf(id);
        if (file === undefined) return Response.json({ problem: `clip ${id} isn't kept any more: record it again` }, { status: 404 });
        const body = new Uint8Array(await req.arrayBuffer());
        if (statSync(join(dir, file)).size + body.byteLength > MAX)
          return Response.json({ problem: `a clip may weigh ${MAX / 1024 / 1024} MB at most` }, { status: 413 });
        appendFileSync(join(dir, file), body);
        return Response.json({ id });
      },
      // `clip/<id>`: the audio, to play back.
      clip: (req) => {
        const found = read(new URL(req.url).pathname.split('/').at(-1) ?? '');
        if (found === undefined) return new Response('no such clip, or not kept any more', { status: 404 });
        return new Response(found.data, { headers: { 'content-type': found.type, 'cache-control': 'no-store' } });
      },
    },
  });
}

export default voice;
