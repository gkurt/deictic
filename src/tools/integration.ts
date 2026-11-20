/**
 * What every bundler's integration shares: the options, the client module that starts the overlay, and
 * the transform that marks a JSX module. Each integration adds what its bundler does its own way: how a
 * module is transformed (a hook, a loader, `onLoad`), how the page loads the client (a virtual module
 * under Vite, a file in `.deictic/` elsewhere, as webpack, Turbopack and Bun have none), where the
 * endpoints are served, and what opens the editor.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ServerPlugin } from '#src/index.ts';
import { checkShortcuts, OWN, ownShortcut, type Shortcut } from '#src/shortcut.ts';

import { ASTRO, locateAstro } from './astro.ts';
import { keptIn } from './kept.ts';
import { JSX, locate, type Located } from './locate.ts';
import { checkPlugins } from './plugins.ts';

export interface DeicticOptions {
  /** The plugins to load, server halves: `tailwind()`, `tasks()`, your own. None by default. */
  plugins?: ServerPlugin[];
  /**
   * What opens the popup on any plugin, at the tab used last: Alt and the left button by default, or
   * `false` for none, leaving only plugins' own shortcuts.
   */
  shortcut?: Shortcut | false;
}

/** The options with their defaults, checked now, so a wrong set stops the dev server as it starts, not the page. */
export function prepare(options: DeicticOptions): { plugins: ServerPlugin[]; shortcut: Shortcut | false | undefined } {
  const plugins = options.plugins ?? [];
  checkPlugins(plugins, options.shortcut);
  return { plugins, shortcut: options.shortcut };
}

/**
 * The client module: the overlay, started with deictic's own shortcut and each plugin that has a half
 * in the page, with its shortcut, checked.
 */
export const clientModule = (plugins: ServerPlugin[], base: string, own?: Shortcut | false) => {
  const [shortcut, ...shortcuts] = checkShortcuts([{ name: OWN, shortcut: ownShortcut(own) }, ...plugins]);
  const paged = plugins.flatMap((p, i) =>
    p.client === undefined ? [] : [{ client: p.client, rest: { shortcut: shortcuts[i], options: p.clientOptions } }],
  );
  return [
    `import { start } from 'deictic/client';`,
    ...paged.map((p, i) => `import p${i} from ${JSON.stringify(p.client)};`),
    // Its shortcut and options as JSON, where it has them: `JSON.stringify` leaves out what's undefined.
    `start({ base: ${JSON.stringify(base)}, shortcut: ${JSON.stringify(shortcut) ?? 'undefined'}, plugins: [${paged.map((p, i) => `{ plugin: p${i}, ...${JSON.stringify(p.rest)} }`).join(', ')}] });`,
  ].join('\n');
};

/**
 * Writes the client module to `.deictic/client.js` for a bundler without virtual modules, and answers
 * its path. Its imports are bare (`deictic/client`, each plugin's), found from the project as its own
 * are. Written only when it changed, so a watching bundler doesn't rebuild for nothing.
 */
export function writeClient(root: string, plugins: ServerPlugin[], base: string, own?: Shortcut | false): string {
  const code = `// Written by deictic as the dev server starts: it starts the overlay in the page.\n${clientModule(plugins, base, own)}\n`;
  // Its own package: an ES module that runs for its effect. An app whose package.json says
  // `"sideEffects": false` would otherwise have webpack drop the import, which is only for its effect.
  const manifest = `${JSON.stringify({ private: true, type: 'module', sideEffects: true }, null, 2)}\n`;
  writeIfChanged(keptIn(root, 'package.json'), manifest);
  return writeIfChanged(keptIn(root, 'client.js'), code);
}

function writeIfChanged(path: string, text: string): string {
  if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeFileSync(path, text);
  return path;
}

/** A module beside `url`, by its name: `.ts` from the source, `.js` from `dist`, as `url` is. */
export const beside = (url: string, name: string) =>
  fileURLToPath(new URL(`./${name}${url.endsWith('.ts') ? '.ts' : '.js'}`, url)).replaceAll('\\', '/');

/**
 * The import of the written client module in the module at `from`, by a relative path with forward
 * slashes: Turbopack can't import a Windows path, and every bundler takes a relative one.
 */
export function importOf(path: string, from: string): string {
  const to = relative(dirname(from), path).replaceAll('\\', '/');
  return `\nimport ${JSON.stringify(to.startsWith('.') ? to : `./${to}`)};\n`;
}

/**
 * A module marked, by its absolute path: its host elements, and `append` after it (the client's import,
 * in the browser). Nothing for a file that isn't JSX, is a dependency's, or is outside the project.
 */
export function mark(code: string, path: string, root: string, append = ''): Located | undefined {
  const file = JSX.test(path) ? fileIn(path, root) : undefined;
  return file === undefined ? undefined : locate(code, file, append);
}

/** An `.astro` component marked, by its absolute path, as `mark` does a module. It's no module of the browser's, so nothing is appended. */
export function markAstro(code: string, path: string, root: string): Located | undefined {
  const file = ASTRO.test(path) ? fileIn(path, root) : undefined;
  return file === undefined ? undefined : locateAstro(code, file, root);
}

/** A project file's path from the root, as a mark has it; nothing for a dependency's or one outside the project. */
function fileIn(path: string, root: string): string | undefined {
  if (/[\\/]node_modules[\\/]/.test(path) || !isAbsolute(path)) return undefined;
  const file = relative(root, path).replaceAll('\\', '/');
  return file.startsWith('..') || isAbsolute(file) ? undefined : file;
}
