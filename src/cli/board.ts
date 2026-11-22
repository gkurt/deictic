/**
 * What the agent's commands share: the board's CLI (`vb`, the project's `@vercel/board`) on the board the dev server
 * uses, the project's `.deictic/` folders, and failing with what to do.
 */
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { runningAt, vbScript } from '#src/plugins/tasks/local.ts';

/** How the commands name each other in what they print, for an agent to run. */
export const ME = 'npx deictic';

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** `1:02.5`, from milliseconds. */
export function clock(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

/** `30m`, `45s`, `1h` or a bare number of seconds, as milliseconds. */
export function duration(text: string): number {
  const [, n, unit = 's'] = /^(\d+(?:\.\d+)?)([smh])?$/.exec(text) ?? [];
  if (n === undefined) fail(`"${text}" isn't a duration: 30m, 45s, 1h, or seconds as a number.`);
  return Number(n) * { s: 1000, m: 60_000, h: 3_600_000 }[unit as 's' | 'm' | 'h'];
}

/** This directory and each above it. */
function* upFrom(dir = process.cwd()) {
  for (let at = resolve(dir); ; at = dirname(at)) {
    yield at;
    if (dirname(at) === at) return;
  }
}

/** Every `.deictic/` near here: in this directory or above, or in a folder of it (a site/, an app/). */
export function deicticDirs(): string[] {
  const found = [...upFrom()].map((d) => join(d, '.deictic')).filter((p) => existsSync(p));
  const walk = (dir: string, depth: number) => {
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

/** The board a `.deictic/` names: the one its dev server started. */
export const boardIn = (dir: string) => runningAt(join(dir, 'board.json'))?.url;

/**
 * The board's URL: `BOARD_URL`, or with none, the board the dev server started for the project, which
 * `.deictic/board.json` names. Nothing where there's neither: `vb` then finds the team's board.
 */
export function boardUrl(): string | undefined {
  const given = process.env.BOARD_URL;
  if (given !== undefined && given !== '') return given;
  return deicticDirs()
    .map(boardIn)
    .find((url) => url !== undefined);
}

/**
 * The coding agents a shell of theirs says it is, by a variable each sets only there. Not one a person's terminal has
 * too (Replit's `REPL_ID`, a `TERM_PROGRAM`): a person writes as themselves.
 */
const AGENTS: [name: string, variables: string[]][] = [
  ['claude', ['CLAUDECODE', 'CLAUDE_CODE']],
  ['codex', ['CODEX_SANDBOX', 'CODEX_THREAD_ID']],
  ['gemini', ['GEMINI_CLI']],
  ['cursor', ['CURSOR_AGENT']],
  ['copilot', ['COPILOT_AGENT', 'COPILOT_CLI']],
  ['opencode', ['OPENCODE']],
  ['auggie', ['AUGMENT_AGENT']],
  ['goose', ['GOOSE_PROVIDER']],
  ['junie', ['JUNIE_DATA', 'JUNIE_SHIM_PATH']],
];

/** A board's profile name: a letter, then up to 31 letters, digits and hyphens. */
const PROFILE = /^[A-Za-z][A-Za-z0-9-]{0,31}$/;

/**
 * Who the board's CLI writes as: `BOARD_PROFILE` where it's set, or else the coding agent this runs in, so its claims,
 * replies and results are its own, not the person's, without its setting anything on each command. By the variable
 * its harness sets, then by `AI_AGENT` (`claude-code_2-1-330_agent` is `claude`). Nothing at a person's terminal.
 */
export function profileOf(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.BOARD_PROFILE !== undefined && env.BOARD_PROFILE !== '') return env.BOARD_PROFILE;
  const known = AGENTS.find(([, variables]) => variables.some((v) => env[v] !== undefined && env[v] !== ''));
  if (known !== undefined) return known[0];
  const named = env.AI_AGENT?.toLowerCase();
  if (named === undefined || named === '') return undefined;
  if (named.startsWith('github_copilot')) return 'copilot';
  // The agent's name, without its version, its kind or what it is (`-code`, `-cli`).
  const name = (named.split('_')[0] ?? '').replace(/-(code|cli|agent)$/, '');
  return PROFILE.test(name) ? name : undefined;
}

/**
 * How to run the board's CLI, as `spawn`'s command, arguments and options, on the environment's board or the
 * project's own, as the agent running it (`profileOf`): the project's `@vercel/board`, run by this runtime, so it
 * needn't be on the PATH and no shell reads the arguments; with none installed, `vb` from the PATH.
 */
export function vbCommand(args: string[]): [string, string[], SpawnSyncOptions] {
  const url = boardUrl();
  const profile = profileOf();
  const env = {
    ...process.env,
    ...(url === undefined ? {} : { BOARD_URL: url }),
    ...(profile === undefined ? {} : { BOARD_PROFILE: profile }),
  };
  const script = vbScript();
  if (script !== undefined) return [process.execPath, [script, ...args], { env }];
  // npm's shims on Windows are .cmd files, which only a shell runs; the arguments here are IDs and names.
  if (process.platform === 'win32') return [`vb ${args.map((a) => `"${a}"`).join(' ')}`, [], { env, shell: true }];
  return ['vb', args, { env }];
}

const unreachable = (message: string) => fail(`vb: ${message}. Install @vercel/board in the project (${ME} init), or put vb on the PATH.`);

/** Runs the board's CLI and answers what it printed. */
export function vb(args: string[]): string {
  const [command, argv, options] = vbCommand(args);
  const run = spawnSync(command, argv, { ...options, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (run.error) unreachable(run.error.message);
  if (run.status !== 0) fail(`vb ${args.join(' ')}: ${run.stderr.trim() || `exit ${run.status}`}`);
  return run.stdout;
}

/** The board's CLI's answer as JSON. */
export const vbJson = <T>(args: string[]): T => JSON.parse(vb([...args, '--json'])) as T;

/** Runs the board's CLI on this terminal, and answers its exit code. */
export function vbHere(args: string[]): number {
  const [command, argv, options] = vbCommand(args);
  const run = spawnSync(command, argv, { ...options, stdio: 'inherit' });
  if (run.error) unreachable(run.error.message);
  return run.status ?? 1;
}

/** Whether the board answers now, as whoever the CLI writes as: asked of one that may be starting again. */
export function answers(): boolean {
  const [command, argv, options] = vbCommand(['whoami', '--json']);
  return spawnSync(command, argv, { ...options, encoding: 'utf8' }).status === 0;
}

/**
 * Who the CLI writes as. `profile` is the name `BOARD_PROFILE` (or `--as`) gave, and `null` without one: then what's
 * written is the person's own, as the board sees it.
 */
export interface Me {
  actor: string;
  handle?: string;
  name?: string;
  profile: string | null;
}

export const whoami = () => vbJson<Me>(['whoami']);

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
}

export interface Message {
  id: number;
  channel: string;
  text: string;
  labels: Record<string, string>;
  attachments: Attachment[];
  createdAt: string;
  by: { actor: string };
  author?: { handle?: string };
  task?: { state: string; claim?: { actor: string; until: string }; result?: string; reason?: string };
}

/** A task's root message and its replies, by its ID (`68` or `#68`). */
export const read = (id: string) => vbJson<{ message: Message; replies: Message[] }>(['read', id.replace(/^#/, '')]);

/** A task's root message. */
export const task = (id: string) => read(id).message;

/** Writes an attachment to a file. */
export const download = (attachment: Attachment, path: string) => vb(['download', attachment.id, path]);
