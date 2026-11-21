/**
 * The board tasks go to when nothing names one: `vb serve`, `@vercel/board`'s own, started with the dev server
 * and stopped with it, its log in `.deictic/board`. So Alt-click adds a task with nothing else to run, and
 * whoever works the tasks reaches the same board at the URL `.deictic/board.json` holds.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';

import { keptIn } from '#src/tools/kept.ts';

/** `vb serve`'s own default, so `http://127.0.0.1:4100/api/board` is the board wherever it's free. */
const PORT = 4100;
/** How long a board may take to answer after it's started. */
const PATIENCE = 20_000;

/** What `.deictic/board.json` holds: the board the dev server started, for whoever works its tasks. */
export interface Running {
  url: string;
  pid: number;
}

export interface Local {
  url: string;
  /** Stops the board, where this call started it: one found running is left to what started it. */
  stop: () => void;
}

/**
 * The project's own board, started unless it's running: a dev server that restarts in its process (Vite, when
 * its config changes) asks again, and so does a second dev server of the same project, and two boards mustn't
 * write one log.
 */
export async function localBoard(root: string): Promise<Local> {
  const file = keptIn(root, 'board.json');
  const running = read(file);
  if (running !== undefined && alive(running.pid) && (await answers(running.url))) return { url: running.url, stop: () => {} };

  const port = await free(PORT);
  const url = `http://127.0.0.1:${port}/api/board`;
  const dir = keptIn(root, 'board');
  const child = spawn(process.execPath, [cli(), 'serve', '--port', String(port), '--no-open', '--dir', dir], {
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
    throw new Error(`the board didn't start (${said.trim() || (e as Error).message}): set BOARD_URL to a board of your own`, { cause: e });
  }
  writeFileSync(file, `${JSON.stringify({ url, pid: child.pid }, null, 2)}\n`);
  // The board ends with this process, and mustn't be what keeps it from ending.
  child.unref();
  (child.stderr as { unref?: () => void }).unref?.();
  return { url, stop };
}

/** `vb`'s script in the project's `@vercel/board`, run with this process's own runtime: no shim, no shell. */
function cli(): string {
  return join(dirname(createRequire(import.meta.url).resolve('@vercel/board/package.json')), 'dist', 'cli.mjs');
}

function read(file: string): Running | undefined {
  try {
    const { url, pid } = JSON.parse(readFileSync(file, 'utf8')) as Partial<Running>;
    return typeof url === 'string' && typeof pid === 'number' ? { url, pid } : undefined;
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

/** Waits for the board to answer, or for its process to end without having. */
async function started(child: ChildProcess, url: string): Promise<void> {
  let ended: string | undefined;
  child.once('error', (e) => (ended = e.message));
  child.once('exit', (code) => (ended ??= `exit ${code}`));
  for (const until = Date.now() + PATIENCE; Date.now() < until;) {
    if (ended !== undefined) throw new Error(ended);
    if (await answers(url)) return;
    await new Promise((wake) => setTimeout(wake, 100));
  }
  throw new Error(`no answer at ${url} after ${PATIENCE / 1000}s`);
}
