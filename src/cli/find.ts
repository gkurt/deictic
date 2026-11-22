/**
 * Finding what a task carries: a recording or a voice clip, by a task's ID, a recording's ID, a replay URL or a path,
 * kept under a `.deictic/` near here or downloaded from the board. And the tools outside deictic some commands run
 * (ffmpeg, the project's Playwright).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Kept } from '#src/plugins/recordings/index.ts';

import { deicticDirs, download, fail, type Message, task } from './board.ts';

const TASK = /^#?\d+$/;

export interface Found {
  kept: Kept;
  id: string;
  /** Where it replays, where that's known. */
  replay?: string;
  /** The task it's attached to, where it was found by one. */
  task?: Message;
}

const parsed = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Kept;

/** An attachment of a task, written to a temporary folder: its path. */
function fetched(root: Message, name: string): string {
  const file = root.attachments.find((a) => a.name === name);
  if (file === undefined) fail(`Task #${root.id} has no ${name}.`);
  const path = join(mkdtempSync(join(tmpdir(), 'deictic-')), file.name);
  download(file, path);
  return path;
}

/**
 * A recording, with where it came from. `ref` is a task's ID (its first recording, or the `nth`), a replay or
 * recording URL, a recording's ID kept under a `.deictic/`, or a path.
 */
export async function loadRecording(ref: string | undefined, nth = 1): Promise<Found> {
  if (ref === undefined) fail('Name a recording: a task (68), a replay URL, a recording ID or a JSON file.');
  if (TASK.test(ref)) {
    const root = task(ref);
    const files = root.attachments.filter((a) => /^recording-.*\.json$/.test(a.name));
    const file = files[nth - 1];
    if (file === undefined) fail(`Task #${root.id} has ${files.length} recording(s), not a ${nth}th.`);
    const id = file.name.slice('recording-'.length, -'.json'.length);
    const replay = new RegExp(`https?://\\S+/replay/${id}`).exec(root.text)?.[0];
    return { kept: parsed(fetched(root, file.name)), id, replay, task: root };
  }
  if (/^https?:/.test(ref)) {
    const url = new URL(ref);
    const id = url.pathname.split('/').at(-1) ?? '';
    const json = new URL(url.pathname.replace(/\/(replay|recording)\/[^/]+$/, `/recording/${id}`), url);
    const res = await fetch(json);
    if (!res.ok) fail(`${json.href}: ${res.status} ${await res.text()}`);
    return { kept: (await res.json()) as Kept, id, replay: new URL(json.pathname.replace(/\/recording\//, '/replay/'), url).href };
  }
  if (existsSync(ref)) return { kept: parsed(ref), id: ref.replace(/^.*[\\/]|\.json$/g, '') };
  for (const dir of deicticDirs()) {
    const path = join(dir, 'recordings', `${ref}.json`);
    if (existsSync(path)) return { kept: parsed(path), id: ref };
  }
  return fail(`No recording ${ref} in ${deicticDirs().join(', ') || 'any .deictic/ near here'}: name its task or replay URL instead.`);
}

/** A voice clip kept under a `.deictic/` near here, by its ID. */
function keptClip(id: string): string | undefined {
  for (const dir of deicticDirs()) {
    const voice = join(dir, 'voice');
    const name = existsSync(voice) ? readdirSync(voice).find((f) => f.startsWith(`${id}.`)) : undefined;
    if (name !== undefined) return join(voice, name);
  }
  return undefined;
}

/** A voice clip's audio as a file: kept under a `.deictic/`, or downloaded from `from`. */
function voiceFile(id: string, from?: Message): string {
  const kept = keptClip(id);
  if (kept !== undefined) return kept;
  const file = from?.attachments.find((a) => a.name.startsWith(`voice-${id}.`));
  if (from === undefined || file === undefined) fail(`No voice clip ${id} here${from ? ` or on task #${from.id}` : ''}.`);
  return fetched(from, file.name);
}

export interface Clip {
  id: string;
  file: string;
  /** Where it starts in its recording, or 0 for a voice note on its own. */
  at: number;
  recording?: string;
}

/**
 * The voice clips `ref` names: a task (every recording's clips and its voice notes), a recording as `loadRecording`
 * takes one, or a clip's ID.
 */
export async function voiceClips(ref: string | undefined): Promise<Clip[]> {
  if (ref === undefined) fail('Name a task, a recording or a voice clip.');
  const clips: Clip[] = [];
  if (TASK.test(ref)) {
    const root = task(ref);
    const recordings = root.attachments.filter((a) => /^recording-.*\.json$/.test(a.name));
    const inRecordings = new Set<string>();
    for (let n = 1; n <= recordings.length; n++) {
      const { kept, id } = await loadRecording(ref, n);
      for (const c of kept.voice ?? []) {
        inRecordings.add(c.id);
        clips.push({ id: c.id, file: voiceFile(c.id, root), at: c.at, recording: id });
      }
    }
    for (const a of root.attachments) {
      const id = /^voice-(.+)\.\w+$/.exec(a.name)?.[1];
      if (id !== undefined && !inRecordings.has(id)) clips.push({ id, file: voiceFile(id, root), at: 0 });
    }
  } else if (!/^https?:/.test(ref) && !existsSync(ref) && keptClip(ref) !== undefined) {
    clips.push({ id: ref, file: voiceFile(ref), at: 0 });
  } else {
    const { kept, id } = await loadRecording(ref);
    for (const c of kept.voice ?? []) clips.push({ id: c.id, file: voiceFile(c.id), at: c.at, recording: id });
  }
  if (clips.length === 0) fail(`No voice on ${ref}.`);
  return clips;
}

/** Runs ffmpeg, which reads what MediaRecorder makes, and answers its log (stderr) and what it wrote to stdout. */
export function ffmpeg(args: string[]): { stdout: Buffer; log: string } {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { maxBuffer: 1 << 30 });
  if (run.error) fail('Needs ffmpeg on the PATH (https://ffmpeg.org/download.html).');
  return { stdout: run.stdout, log: run.stderr.toString('utf8') };
}

/** The project's own copy of a package deictic doesn't bring (Playwright, either of its names), from here. */
export async function fromProject<T>(...names: string[]): Promise<T> {
  const project = createRequire(join(process.cwd(), 'package.json'));
  for (const name of names) {
    try {
      return (await import(pathToFileURL(project.resolve(name)).href)) as T;
    } catch {
      // Not this one: the next name.
    }
  }
  return fail(`Needs ${names.join(' or ')} in the project: npm install -D ${names[0]}`);
}
