/**
 * The packages plugins import that the project installs itself (`ServerPlugin.packages`: deictic's optional peers,
 * or a plugin's own), and how to install them with the project's package manager. A missing one is said as the dev
 * server starts, with the command that installs it, not on the first shot or recording, where it would fail.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import manifest from '#package.json' with { type: 'json' };
import type { ServerPlugin } from '#src/index.ts';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/** Each package manager's lockfiles, in the order they're looked for in a folder. */
const LOCKS: [string, PackageManager][] = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
];
const MANAGERS: PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun'];

/**
 * The project's package manager: its `packageManager` field, or the lockfile nearest the root (a workspace's is
 * above it), or the one running this (`npm_config_user_agent`), or npm. The lockfile wins over what runs this,
 * as `npx deictic init` runs under npm in a project of any manager's.
 */
export function packageManager(root: string, agent = process.env.npm_config_user_agent): PackageManager {
  for (let dir = root; ; dir = dirname(dir)) {
    const field = fieldOf(dir);
    if (field !== undefined) return field;
    const lock = LOCKS.find(([file]) => existsSync(join(dir, file)));
    if (lock !== undefined) return lock[1];
    if (dirname(dir) === dir) break;
  }
  const running = agent?.split('/')[0];
  return MANAGERS.find((m) => m === running) ?? 'npm';
}

/** A package.json's `packageManager` (`pnpm@9.1.0`), by its manager's name. */
function fieldOf(dir: string): PackageManager | undefined {
  const field = readJson(join(dir, 'package.json'))?.packageManager;
  const name = typeof field === 'string' ? field.split('@')[0] : undefined;
  return MANAGERS.find((m) => m === name);
}

export function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * A package as the install command names it: with deictic's range for it where it's one of deictic's peers (rrweb's
 * packages must agree), or deictic's own version for deictic. Quoted, as `>` and `^` are a shell's.
 */
export function specOf(name: string): string {
  const range = name === manifest.name ? `^${manifest.version}` : (manifest.peerDependencies as Record<string, string>)[name];
  return range === undefined ? name : `"${name}@${range}"`;
}

/** The command that adds `names` to the project's dev dependencies. A pnpm workspace's root takes them only with `-w`. */
export function installCommand(manager: PackageManager, names: readonly string[], root: string): string {
  const add = {
    npm: 'npm install -D',
    pnpm: existsSync(join(root, 'pnpm-workspace.yaml')) ? 'pnpm add -D -w' : 'pnpm add -D',
    yarn: 'yarn add -D',
    bun: 'bun add -d',
  }[manager];
  return [add, ...names.map(specOf)].join(' ');
}

/** What runs a package's CLI without installing it, for the manager: `npx`, `bunx`. */
export const runnerOf = (manager: PackageManager) => ({ npm: 'npx', pnpm: 'pnpm dlx', yarn: 'npx', bun: 'bunx' })[manager];

/** What runs a CLI the project installed, for the manager: `npx`, `bunx`, each the project's own version. */
export const execOf = (manager: PackageManager) => ({ npm: 'npx', pnpm: 'pnpm exec', yarn: 'yarn', bun: 'bunx' })[manager];

/** Whether the project can import `name`: it's found from the root, as the bundler and deictic's own imports find it. */
export function installed(root: string, name: string): boolean {
  try {
    createRequire(join(root, 'package.json')).resolve(`${name}/package.json`);
    return true;
  } catch (e) {
    // There, but its `exports` don't name its package.json: only "not found" means it's missing.
    return (e as { code?: string }).code !== 'MODULE_NOT_FOUND';
  }
}

/** Each plugin with the packages it imports that the project hasn't installed, where it has any. */
export function missing(root: string, plugins: readonly ServerPlugin[]): { plugin: string; packages: string[] }[] {
  return plugins.flatMap(({ name, packages = [] }) => {
    const gone = packages.filter((p) => !installed(root, p));
    return gone.length === 0 ? [] : [{ plugin: name, packages: gone }];
  });
}

/** What to say as the dev server starts when plugins' packages are missing: which, and the command that installs them. */
export function missingMessage(root: string, plugins: readonly ServerPlugin[]): string | undefined {
  const gone = missing(root, plugins);
  if (gone.length === 0) return undefined;
  const names = [...new Set(gone.flatMap((g) => g.packages))];
  const which = gone.map((g) => g.plugin);
  const who = which.length === 1 ? which[0] : `${which.slice(0, -1).join(', ')} and ${which.at(-1)}`;
  return `deictic: install what ${who} ${which.length === 1 ? 'needs' : 'need'}: ${installCommand(packageManager(root), names, root)}`;
}
