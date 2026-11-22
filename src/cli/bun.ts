/**
 * `init` for Bun's own dev server: `Bun.serve` with HTML imports, which bundles the page with the plugins bunfig.toml
 * names. Only that: a Bun project that runs Vite, Next.js or another bundler is that bundler's, and one with no HTML
 * imports has no page of Bun's for deictic to be in. Three steps, as the API has them: the plugin's module, bunfig's
 * `[serve.static] plugins`, and its routes spread into `Bun.serve`'s.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import MagicString from 'magic-string';
import { type CallExpression, parseSync, Visitor } from 'oxc-parser';

import { addFirst, addImports, eolOf } from './edit.ts';

/** The plugin's module, from the root, which bunfig names and the server imports. */
export const MODULE = 'deictic.plugin.ts';

export const PLUGIN = `import { deictic } from 'deictic/bun';
import { recommended } from 'deictic/recommended';

// One module for both: bunfig.toml names it as the dev server's bundler plugin, and the server spreads its routes,
// deictic's endpoints, into its own.
export default deictic({ plugins: recommended() });
`;

const SOURCE = /\.[cm]?[jt]sx?$/;
const SKIP = new Set(['node_modules', 'dist', 'build', 'out']);
const SERVE = /\bBun\.serve\s*\(/;
const HTML = /\bfrom\s*['"][^'"]+\.html['"]/;

/**
 * The module that serves the page with Bun's bundler: it calls `Bun.serve` and imports an HTML file. Looked for under
 * the root, not in dependencies, builds or dot folders, a few folders deep.
 */
export function serverOf(root: string): string | undefined {
  const walk = (dir: string, depth: number): string | undefined => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return undefined;
    }
    for (const e of entries) {
      if (!e.isFile() || !SOURCE.test(e.name)) continue;
      const path = join(dir, e.name);
      const code = readFileSync(path, 'utf8');
      if (SERVE.test(code) && HTML.test(code)) return path;
    }
    if (depth === 0) return undefined;
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP.has(e.name)) continue;
      const found = walk(join(dir, e.name), depth - 1);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return walk(root, 3);
}

/**
 * bunfig.toml with the plugin's module first in `[serve.static] plugins` (first, so it sees the source as written),
 * made where there's none; unchanged where it's there already, and nothing where bunfig says it another way (a dotted
 * key, an inline table) and it can't tell where.
 */
export function addToBunfig(text: string | undefined, entry = `./${MODULE}`): string | undefined {
  const quoted = JSON.stringify(entry);
  if (text === undefined) return `[serve.static]\nplugins = [${quoted}]\n`;
  if (text.includes(entry)) return text;
  if (/serve\.static\.|static\s*=\s*\{/.test(text)) return undefined;
  const eol = eolOf(text);
  const header = /^[ \t]*\[serve\.static\][ \t]*(#.*)?$/m.exec(text);
  if (header === null)
    return `${text}${text === '' || text.endsWith('\n') ? '' : eol}${eol}[serve.static]${eol}plugins = [${quoted}]${eol}`;
  const bodyStart = header.index + header[0].length;
  const next = /^[ \t]*\[/m.exec(text.slice(bodyStart));
  const body = text.slice(bodyStart, next === null ? text.length : bodyStart + next.index);
  const list = /^[ \t]*plugins[ \t]*=[ \t]*\[/m.exec(body);
  if (list === null) return `${text.slice(0, bodyStart)}${eol}plugins = [${quoted}]${text.slice(bodyStart)}`;
  const open = bodyStart + list.index + list[0].length;
  const rest = text.slice(open);
  const empty = /^\s*\]/.test(rest);
  const lineBreak = /^[ \t]*\r?\n([ \t]*)/.exec(rest);
  if (empty) return `${text.slice(0, open)}${quoted}${rest.trimStart()}`;
  if (lineBreak !== null) return `${text.slice(0, open)}${eol}${lineBreak[1]}${quoted},${rest}`;
  return `${text.slice(0, open)}${quoted}, ${rest.trimStart()}`;
}

/**
 * The server with the plugin's routes first in `Bun.serve`'s `routes`, or `routes` with them where it has none, and
 * the module imported: nothing where `Bun.serve` isn't given an object it can see, or its routes aren't one.
 */
export function addToServer(file: string, code: string, root: string): string | undefined {
  const { program, errors } = parseSync(file, code, { preserveParens: false });
  if (errors.length > 0) return undefined;
  const calls: CallExpression[] = [];
  new Visitor({
    CallExpression(node) {
      const { callee } = node;
      if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'Bun' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'serve'
      )
        calls.push(node);
    },
  }).visit(program);
  const options = calls.length === 1 ? calls[0]!.arguments[0] : undefined;
  if (options?.type !== 'ObjectExpression') return undefined;

  // `tools`, as the API names it, unless the module has a `tools` of its own.
  const name = /\btools\b/.test(code) ? 'deicticTools' : 'tools';
  const out = new MagicString(code);
  const routes = options.properties.find(
    (p) => p.type === 'Property' && !p.computed && p.key.type === 'Identifier' && p.key.name === 'routes',
  );
  if (routes === undefined) {
    addFirst(out, code, options.start, options.properties[0], `routes: { ...${name}.routes }`);
  } else {
    if (routes.type !== 'Property' || routes.value.type !== 'ObjectExpression') return undefined;
    addFirst(out, code, routes.value.start, routes.value.properties[0], `...${name}.routes`);
  }
  const from = relative(dirname(file), join(root, MODULE)).replaceAll('\\', '/');
  addImports(out, program, code, [[name, from.startsWith('.') ? from : `./${from}`]]);
  return out.toString();
}

/** What to add by hand, for a server or a bunfig it can't edit. */
export const BY_HAND = {
  bunfig: `[serve.static]\nplugins = ["./${MODULE}"]`,
  server: `import tools from './${MODULE}';\nBun.serve({ routes: { ...tools.routes, '/*': index } });`,
};
