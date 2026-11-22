// What the scripts share: the board's CLI, the project's `.deictic/` folders, and finding a recording or a
// voice clip by a task's ID, a recording's ID, a replay URL or a path. Node 20 or Bun; no dependencies.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** `--name value` and `--flag` options, and the arguments around them. */
export function parseArgs(argv, flags = []) {
  const options = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) rest.push(a);
    else if (flags.includes(a.slice(2))) options[a.slice(2)] = true;
    else (options[a.slice(2)] ??= []).push(argv[++i]);
  }
  return { options, rest };
}

export function fail(message) {
  console.error(message);
  process.exit(1);
}

/** `1:02.5`, from milliseconds. */
export function clock(ms) {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

/** This directory and each above it. */
function* upFrom(dir = process.cwd()) {
  for (let at = resolve(dir); ; at = dirname(at)) {
    yield at;
    if (dirname(at) === at) return;
  }
}

/** Every `.deictic/` near here: in this directory or above, or in a folder of it (a site/, an app/). */
export function deicticDirs() {
  const found = [...upFrom()].map((d) => join(d, '.deictic')).filter((p) => existsSync(p));
  const walk = (dir, depth) => {
    if (depth === 0) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'node_modules' || (e.name.startsWith('.') && e.name !== '.deictic')) continue;
      const path = join(dir, e.name);
      if (e.name === '.deictic') found.push(path);
      else walk(path, depth - 1);
    }
  };
  walk(process.cwd(), 3);
  return [...new Set(found)];
}

/**
 * The board's URL: `BOARD_URL`, or with none, the board the dev server started for the project, which
 * `.deictic/board.json` names. Nothing where there's neither: `vb` then finds the team's board.
 */
export function boardUrl() {
  if (process.env.BOARD_URL) return process.env.BOARD_URL;
  for (const dir of deicticDirs()) {
    try {
      const { url } = JSON.parse(readFileSync(join(dir, 'board.json'), 'utf8'));
      if (typeof url === 'string') return url;
    } catch {
      // No board of this project's own: the next one's, or the team's.
    }
  }
  return undefined;
}

/** The project's own `@vercel/board` CLI, as a script: from here, above, or beside a `.deictic/` near here. */
function vbScript() {
  for (const dir of new Set([...upFrom(), ...deicticDirs().map(dirname)])) {
    const pkg = join(dir, 'node_modules', '@vercel', 'board', 'package.json');
    if (!existsSync(pkg)) continue;
    const { bin } = JSON.parse(readFileSync(pkg, 'utf8'));
    const entry = typeof bin === 'string' ? bin : bin?.vb;
    if (typeof entry === 'string') return join(dirname(pkg), entry);
  }
  return undefined;
}

/**
 * How to run the board's CLI, with the environment's board or the project's own, as `spawn`'s command,
 * arguments and options: the project's `@vercel/board`, run by this runtime, so it needn't be on the PATH and
 * no shell reads the arguments; with none installed, `vb` from the PATH.
 */
export function vbCommand(args) {
  const bins = [...upFrom()].map((d) => join(d, 'node_modules', '.bin'));
  const url = boardUrl();
  const env = { ...process.env, ...(url === undefined ? {} : { BOARD_URL: url }), PATH: [...bins, process.env.PATH].join(delimiter) };
  const script = vbScript();
  if (script !== undefined) return [process.execPath, [script, ...args], { env }];
  // npm's shims on Windows are .cmd files, which only a shell runs; the arguments here are IDs and names.
  if (process.platform === 'win32') return [`vb ${args.map((a) => `"${a}"`).join(' ')}`, [], { env, shell: true }];
  return ['vb', args, { env }];
}

/** Runs the board's CLI and answers what it printed: parsed with `json`, bytes for a download to stdout. */
export function vb(args, { json = false } = {}) {
  const [command, argv, options] = vbCommand(json ? [...args, '--json'] : args);
  const run = spawnSync(command, argv, {
    ...options,
    encoding: json || args[0] !== 'download' ? 'utf8' : 'buffer',
    maxBuffer: 1 << 28,
  });
  if (run.error) fail(`vb: ${run.error.message}. Install @vercel/board in the project, or put vb on the PATH.`);
  if (run.status !== 0) fail(`vb ${args.join(' ')}: ${String(run.stderr).trim() || `exit ${run.status}`}`);
  return json ? JSON.parse(run.stdout) : run.stdout;
}

/**
 * Who the CLI writes as: `{ actor, handle, profile }`. `profile` is the name `BOARD_PROFILE` (or `--as`) gave, and
 * `null` without one: then what's written is the person's own, as the board sees it.
 */
export const whoami = () => vb(['whoami'], { json: true });

/** A task's root message, by its ID (`68` or `#68`). */
export const task = (id) => vb(['read', String(id).replace(/^#/, '')], { json: true }).message;

/** An attachment's bytes. */
export const download = (attachment) => vb(['download', attachment.id, '-']);

const TASK = /^#?\d+$/;

/**
 * A recording, with where it came from: `{ kept, id, replay?, task? }`. `ref` is a task's ID (its first
 * recording, or the `nth`), a replay or recording URL, a recording's ID kept under a `.deictic/`, or a path.
 */
export async function loadRecording(ref, nth = 1) {
  if (ref === undefined) fail('Name a recording: a task (68), a replay URL, a recording ID or a JSON file.');
  if (TASK.test(ref)) {
    const root = task(ref);
    const files = root.attachments.filter((a) => /^recording-.*\.json$/.test(a.name));
    const file = files[nth - 1];
    if (file === undefined) fail(`Task #${root.id} has ${files.length} recording(s), not a ${nth}th.`);
    const kept = JSON.parse(download(file).toString('utf8'));
    const id = file.name.slice('recording-'.length, -'.json'.length);
    const replay = root.text.match(new RegExp(`https?://\\S+/replay/${id}`))?.[0];
    return { kept, id, replay, task: root };
  }
  if (/^https?:/.test(ref)) {
    const url = new URL(ref);
    const id = url.pathname.split('/').at(-1);
    const json = new URL(url.pathname.replace(/\/(replay|recording)\/[^/]+$/, `/recording/${id}`), url);
    const res = await fetch(json);
    if (!res.ok) fail(`${json}: ${res.status} ${await res.text()}`);
    return { kept: await res.json(), id, replay: new URL(json.pathname.replace(/\/recording\//, '/replay/'), url).href };
  }
  if (existsSync(ref)) return { kept: JSON.parse(readFileSync(ref, 'utf8')), id: ref.replace(/^.*[\\/]|\.json$/g, '') };
  for (const dir of deicticDirs()) {
    const path = join(dir, 'recordings', `${ref}.json`);
    if (existsSync(path)) return { kept: JSON.parse(readFileSync(path, 'utf8')), id: ref };
  }
  fail(`No recording ${ref} in ${deicticDirs().join(', ') || 'any .deictic/ near here'}: name its task or replay URL instead.`);
}

/** A voice clip's audio as a file: kept under a `.deictic/`, or downloaded from `fromTask` to a temporary folder. */
export function voiceFile(id, fromTask) {
  for (const dir of deicticDirs()) {
    const voice = join(dir, 'voice');
    const name = existsSync(voice) ? readdirSync(voice).find((f) => f.startsWith(`${id}.`)) : undefined;
    if (name !== undefined) return join(voice, name);
  }
  const file = fromTask?.attachments.find((a) => a.name.startsWith(`voice-${id}.`));
  if (file === undefined) fail(`No voice clip ${id} here${fromTask ? ` or on task #${fromTask.id}` : ''}.`);
  const path = join(mkdtempSync(join(tmpdir(), 'deictic-voice-')), file.name);
  // The CLI writes an attachment to a path of our choosing.
  vb(['download', file.id, path]);
  return path;
}

/**
 * The voice clips `ref` names, each `{ id, file, at, recording? }`: `at` is where it starts in its recording (0
 * for a voice note on its own). `ref` is a task (every recording's clips and its voice notes), a recording as
 * `loadRecording` takes one, or a clip's ID.
 */
export async function voiceClips(ref) {
  if (ref === undefined) fail('Name a task, a recording or a voice clip.');
  const clips = [];
  if (TASK.test(ref)) {
    const root = task(ref);
    const recordings = root.attachments.filter((a) => /^recording-.*\.json$/.test(a.name));
    const inRecordings = new Set();
    for (let n = 1; n <= recordings.length; n++) {
      const { kept, id } = await loadRecording(ref, n);
      for (const c of kept.voice ?? []) {
        inRecordings.add(c.id);
        clips.push({ id: c.id, file: voiceFile(c.id, root), at: c.at, recording: id });
      }
    }
    for (const a of root.attachments) {
      const id = a.name.match(/^voice-(.+)\.\w+$/)?.[1];
      if (id !== undefined && !inRecordings.has(id)) clips.push({ id, file: voiceFile(id, root), at: 0 });
    }
  } else if (!/^https?:/.test(ref) && !existsSync(ref) && isClip(ref)) {
    clips.push({ id: ref, file: voiceFile(ref), at: 0 });
  } else {
    const { kept, id } = await loadRecording(ref);
    for (const c of kept.voice ?? []) clips.push({ id: c.id, file: voiceFile(c.id), at: c.at, recording: id });
  }
  if (clips.length === 0) fail(`No voice on ${ref}.`);
  return clips;
}

const isClip = (id) =>
  deicticDirs().some((d) => existsSync(join(d, 'voice')) && readdirSync(join(d, 'voice')).some((f) => f.startsWith(`${id}.`)));

/** Runs ffmpeg, which reads what MediaRecorder makes; its log is on stderr. */
export function ffmpeg(args, encoding = 'utf8') {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding, maxBuffer: 1 << 30 });
  if (run.error) fail('Needs ffmpeg on the PATH (https://ffmpeg.org/download.html).');
  return run;
}

/** The project's own copy of a package, where a script needs one it doesn't bundle (Playwright). */
export async function fromProject(...names) {
  for (const dir of upFrom()) {
    for (const name of names) {
      const pkg = join(dir, 'node_modules', name, 'package.json');
      if (!existsSync(pkg)) continue;
      const { exports, main } = JSON.parse(readFileSync(pkg, 'utf8'));
      const entry = exports?.['.']?.import ?? exports?.['.']?.default ?? main ?? 'index.js';
      const path = join(dirname(pkg), typeof entry === 'string' ? entry : (entry.default ?? 'index.js'));
      return import(pathToFileURL(path).href);
    }
  }
  return fail(`Needs ${names.join(' or ')} in the project: npm install -D ${names[0]}`);
}
