/**
 * `deictic clean`: deletes what deictic kept, for a person who'd rather not delete `.deictic/` by hand. It says what
 * it found and how big, then asks; with no terminal to ask on, it deletes only with `--yes`, so an agent sees the list
 * first. By default the shots, recordings and voice clips, which tasks carry on the board anyway; the history (undo)
 * and the local board (its tasks) only when named, and only with the dev server stopped, as a running one holds both.
 * Transcription's install is outside the project, shared by every project on the machine, so only when named.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { alive, runningAt } from '#src/plugins/tasks/local.ts';

import { deicticDirs, fail, ME, parseArgs } from './board.ts';
import { transcribeDir } from './transcribe.ts';

export const usage = `clean [screenshots] [recordings] [voice] [history] [board] [all] [transcribe] [--yes]   deletes what deictic kept, after asking
  (shots, recordings and voice by default; history and board with the dev server stopped; transcribe is the machine's)`;

const CAPTURES = ['screenshots', 'recordings', 'voice'] as const;
const PROJECT = [...CAPTURES, 'history', 'board'] as const;
type Part = (typeof PROJECT)[number] | 'transcribe';
const PARTS: readonly string[] = [...PROJECT, 'transcribe', 'all'];

/** What one part of a `.deictic/` is on disk: the paths to delete. */
function pathsOf(dir: string, part: Part): string[] {
  if (part === 'history') return [join(dir, 'history.json')].filter((p) => existsSync(p));
  if (part === 'board') return [join(dir, 'board'), join(dir, 'board.json')].filter((p) => existsSync(p));
  const folder = join(dir, part);
  if (!existsSync(folder)) return [];
  // A recording still going is its `.part`: the plugin drops one nobody ended a day on.
  return readdirSync(folder)
    .filter((f) => !f.endsWith('.part'))
    .map((f) => join(folder, f));
}

function sizeOf(path: string): number {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce((sum, f) => sum + sizeOf(join(path, f)), 0);
}

const UNITS = [
  ['GB', 1e9],
  ['MB', 1e6],
  ['KB', 1e3],
] as const;

function bytes(n: number): string {
  const unit = UNITS.find(([, size]) => n >= size);
  return unit === undefined ? `${n} bytes` : `${(n / unit[1]).toFixed(1)} ${unit[0]}`;
}

interface Found {
  label: string;
  paths: string[];
  size: number;
}

async function ask(question: string): Promise<boolean> {
  const lines = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y/i.test((await lines.question(`${question} (y/N) `)).trim());
  } finally {
    lines.close();
  }
}

export async function run(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs(args, { yes: { type: 'boolean', short: 'y' } });
  const wrong = positionals.find((p) => !PARTS.includes(p));
  if (wrong !== undefined) fail(`clean: no "${wrong}" to clean. It cleans ${PARTS.join(', ')}.`);
  const named = positionals.filter((p): p is Part => p !== 'all');
  const parts = positionals.length === 0 ? [...CAPTURES] : [...new Set([...(positionals.includes('all') ? PROJECT : []), ...named])];

  const found: Found[] = [];
  for (const dir of deicticDirs()) {
    const running = runningAt(join(dir, 'board.json'));
    const serving = running !== undefined && alive(running.pid);
    for (const part of parts.filter((p) => p !== 'transcribe')) {
      const paths = pathsOf(dir, part);
      if (paths.length === 0) continue;
      const file = join(dir, part === 'history' ? 'history.json' : part);
      const where = relative(process.cwd(), file) || file;
      if (serving && (part === 'history' || part === 'board'))
        fail(`clean: ${where} is the running dev server's: stop it, then clean again.`);
      found.push({ label: where, paths, size: paths.reduce((s, p) => s + sizeOf(p), 0) });
    }
  }
  const machine = transcribeDir();
  if (parts.includes('transcribe') && existsSync(machine)) found.push({ label: machine, paths: [machine], size: sizeOf(machine) });

  if (found.length === 0) {
    console.log(
      `Nothing to clean near here${positionals.length === 0 ? ` (no shots, recordings or voice clips; ${ME} clean all for the rest)` : ''}.`,
    );
    return;
  }
  const width = Math.max(...found.map((f) => f.label.length));
  for (const f of found) console.log(`  ${f.label.padEnd(width)}  ${bytes(f.size)}`);
  const total = bytes(found.reduce((s, f) => s + f.size, 0));

  const yes = values.yes === true || (process.stdin.isTTY && process.stdout.isTTY ? await ask(`Delete these, ${total}?`) : undefined);
  if (yes === undefined) {
    console.log(`Nothing deleted. ${ME} clean ${[...positionals, '--yes'].join(' ')} deletes these (${total}).`);
    return;
  }
  if (!yes) return;
  for (const f of found) for (const p of f.paths) rmSync(p, { recursive: true, force: true });
  console.log(`Deleted ${total}.`);
}
