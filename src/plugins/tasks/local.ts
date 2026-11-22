/**
 * The board tasks go to when nothing names one: `vb serve`, `@vercel/board`'s own, started with the dev server
 * and stopped with it, its log in `.deictic/board`. So Alt-click adds a task with nothing else to run, and
 * whoever works the tasks reaches the same board at the URL `.deictic/board.json` holds.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';

import { keptIn } from '#src/tools/kept.ts';

/** `vb serve`'s own default, so `http://127.0.0.1:4100/api/board` is the board wherever it's free. */
const PORT = 4100;
/** How long a board may take to answer after it's started, or to be gone after it's stopped. */
const PATIENCE = 20_000;

export interface LocalOptions {
  /**
   * The port it listens on, on 127.0.0.1. By default 4100, or a free one where that's taken. One named here is
   * the only one tried: taken, the board doesn't start.
   */
  port?: number;
  /** Where its log is kept, from the project's root: `.deictic/board` by default. */
  dir?: string;
  /** `false` for no pages of the board's own (its inspector): the panel then links its tasks nowhere. */
  inspect?: boolean;
  /** More arguments for `vb serve`, as it takes them: `['--tailscale', 'box.tailnet.ts.net']`. */
  args?: string[];
}

/** What `local()` answers, for the tasks plugin's `board` option. */
export interface LocalBoard {
  local: LocalOptions;
}

/**
 * The project's own board on this machine, as the tasks plugin's `board`: what it uses anyway with no
 * `BOARD_URL`, here whatever the environment says, and with options.
 */
export const local = (options: LocalOptions = {}): LocalBoard => ({ local: options });

/** What `.deictic/board.json` holds: the board the dev server started, for whoever works its tasks. */
export interface Running {
  url: string;
  pid: number;
  /** The options it was started with, as one string to compare: other ones need another board. */
  as: string;
}

export interface Local {
  url: string;
  /** Whether this call started it, rather than found it running. */
  fresh: boolean;
  /** Where its log is. */
  dir: string;
  /** Stops the board, where this call started it: one found running is left to what started it. */
  stop: () => void;
}

/**
 * The project's own board, started unless it's running: a dev server that restarts in its process (Vite, when
 * its config changes) asks again, and so does a second dev server of the same project, and two boards mustn't
 * write one log. One running with other options is stopped first, for the same reason.
 */
export async function localBoard(root: string, options: LocalOptions = {}): Promise<Local> {
  const file = keptIn(root, 'board.json');
  const dir = options.dir === undefined ? keptIn(root, 'board') : resolve(root, options.dir);
  const flags = [...(options.inspect === false ? ['--no-inspect'] : []), ...(options.args ?? [])];
  const as = JSON.stringify([options.port ?? null, dir, flags]);

  const running = runningAt(file);
  if (running !== undefined && alive(running.pid) && (await answers(running.url))) {
    if (running.as === as) return { url: running.url, fresh: false, dir, stop: () => {} };
    process.kill(running.pid);
    await gone(running.url);
  }

  const port = options.port ?? (await free(PORT));
  const url = `http://127.0.0.1:${port}/api/board`;
  const script = vbScript();
  if (script === undefined) throw new Error('@vercel/board is missing: add it to your devDependencies');
  const child = spawn(process.execPath, [script, 'serve', '--port', String(port), '--no-open', '--dir', dir, ...flags], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let said = '';
  child.stderr.on('data', (chunk: Buffer) => (said += chunk.toString()));
  const stop = () => void child.kill();
  process.once('exit', stop);

  try {
    await started(child, url);
  } catch (e) {
    stop();
    const fix = options.port === undefined ? 'set BOARD_URL to a board of your own' : `is port ${port} taken? name another, or none`;
    throw new Error(`the board didn't start (${said.trim() || (e as Error).message}): ${fix}`, { cause: e });
  }
  writeFileSync(file, `${JSON.stringify({ url, pid: child.pid, as }, null, 2)}\n`);
  // The board ends with this process, and mustn't be what keeps it from ending.
  child.unref();
  (child.stderr as { unref?: () => void }).unref?.();
  return { url, fresh: true, dir, stop };
}

/**
 * `vb`'s script in the project's `@vercel/board`, by its `bin`, to run with this process's own runtime: no shim, no
 * shell. Nothing where it isn't installed.
 */
export function vbScript(): string | undefined {
  try {
    const manifest = createRequire(import.meta.url).resolve('@vercel/board/package.json');
    const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: string | { vb?: string } };
    const entry = typeof bin === 'string' ? bin : bin?.vb;
    return entry === undefined ? undefined : join(dirname(manifest), entry);
  } catch {
    return undefined;
  }
}

/** What a `.deictic/board.json` says, where it says it. */
export function runningAt(file: string): Running | undefined {
  try {
    const { url, pid, as } = JSON.parse(readFileSync(file, 'utf8')) as Partial<Running>;
    return typeof url === 'string' && typeof pid === 'number' ? { url, pid, as: as ?? '' } : undefined;
  } catch {
    return undefined;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Whether a board answers there: its discovery, which names its own URL. */
async function answers(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok && ((await res.json()) as { url?: unknown }).url === url;
  } catch {
    return false;
  }
}

/** `wanted` where nothing listens on it (another project's board may), or else a port the system picks. */
async function free(wanted: number): Promise<number> {
  const listen = (port: number) =>
    new Promise<number>((done, failed) => {
      const server = createServer();
      server.once('error', failed);
      server.listen(port, '127.0.0.1', () => {
        const { port: got } = server.address() as { port: number };
        server.close(() => done(got));
      });
    });
  return listen(wanted).catch(() => listen(0));
}

const nap = () => new Promise((wake) => setTimeout(wake, 100));

/** Waits for the board to answer, or for its process to end without having. */
async function started(child: ChildProcess, url: string): Promise<void> {
  let ended: string | undefined;
  child.once('error', (e) => (ended = e.message));
  child.once('exit', (code) => (ended ??= `exit ${code}`));
  for (const until = Date.now() + PATIENCE; Date.now() < until; await nap()) {
    if (ended !== undefined) throw new Error(ended);
    if (await answers(url)) return;
  }
  throw new Error(`no answer at ${url} after ${PATIENCE / 1000}s`);
}

/** Waits for a stopped board to let go of its port and its log. */
async function gone(url: string): Promise<void> {
  for (const until = Date.now() + PATIENCE; Date.now() < until; await nap()) if (!(await answers(url))) return;

  throw new Error(`the board at ${url} is still running: stop it, then restart the dev server`);
}
