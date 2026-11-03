/**
 * `deictic/next`: deictic in `next dev`, on Turbopack. Nothing runs in `next build`.
 *
 * Turbopack has no transform hook and no virtual modules, so a loader rule (`loader.ts`) marks each JSX
 * module, on the server too, which marks server components' elements in the HTML they render; in the
 * browser it also imports the client module, written to `.deictic/client.js`. Only code the browser
 * loads can start the overlay, so a page with no client component at all has none.
 *
 * The endpoints can't be a route of the app without a file in it, so a server of their own answers them
 * on a local port, and a rewrite sends `/__deictic/*` there, before any of the app's own; Next's proxy
 * forwards the page's host, so writes are still checked against its origin. A place opens through
 * Next's own `/__nextjs_launch-editor`.
 *
 * Turbopack only: Next 16 builds with it by default, and fails a Turbopack build whose config has a
 * `webpack` key, so none is added.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';

import type { ServerPlugin } from './index.ts';
import type { LoaderOptions } from './loader.ts';
import { endpoints, nodeMiddleware, redirect } from './tools/endpoints.ts';
import { beside, type DeicticOptions, prepare, writeClient } from './tools/integration.ts';

export interface DeicticNextOptions extends DeicticOptions {
  /** The project's root, which marks and edits are from: the working directory `next dev` runs in by default. */
  root?: string;
}

/** A Turbopack rule: ours, or whatever the app has. */
type Rule = { condition?: unknown; loaders: { loader: string; options: LoaderOptions }[] } | object;
type Rules = Record<string, Rule | Rule[]>;
type Rewrite = { source: string; destination: string };
type Rewrites = Rewrite[] | { beforeFiles?: Rewrite[]; afterFiles?: Rewrite[]; fallback?: Rewrite[] };
type ConfigFunction<C> = (phase: string, context: { defaultConfig: C }) => C | Promise<C>;

const DEV = 'phase-development-server';
const loaderPath = beside(import.meta.url, 'loader');
const GLOBS = ['*.tsx', '*.jsx'];

// Next loads its config more than once in a process: one endpoints server per project is enough.
const serving = new Map<string, Promise<number>>();

/**
 * Wraps the Next config: `export default withDeictic({ ... }, { plugins: [tailwind()] })`. Takes the
 * config as an object or as the function Next calls with the phase, and returns the function.
 */
export function withDeictic<C extends object>(
  next: C | ConfigFunction<C> = {} as C,
  options: DeicticNextOptions = {},
): (phase: string, context: { defaultConfig: C }) => Promise<C> {
  // Now, so a wrong set of plugins stops the dev server as it starts, rather than the page.
  const { plugins, shortcut } = prepare(options);
  return async (phase, context) => {
    const resolved = typeof next === 'function' ? await next(phase, context) : next;
    if (phase !== DEV) return resolved;
    const root = resolve(options.root ?? process.cwd());
    const base = `${(resolved as { basePath?: string }).basePath ?? ''}/`;
    const client = writeClient(root, plugins, base, shortcut);
    const rules: [string, Rule][] = GLOBS.flatMap((glob) => [
      [glob, { condition: { all: ['browser', { not: 'foreign' }] }, loaders: [{ loader: loaderPath, options: { root, client } }] }],
      [glob, { condition: { all: [{ not: 'browser' }, { not: 'foreign' }] }, loaders: [{ loader: loaderPath, options: { root } }] }],
    ]);
    return withRewrite(withRules(resolved, rules), await serve(root, plugins, base));
  };
}

/** The app's rules and ours: where both have one for a glob, theirs first, then ours, in a list. */
function withRules<C extends object>(resolved: C, ours: [string, Rule][]): C {
  const turbopack = (resolved as { turbopack?: { rules?: Rules } }).turbopack;
  const rules: Rules = { ...turbopack?.rules };
  for (const [glob, rule] of ours) rules[glob] = glob in rules ? [rules[glob], rule].flat() : rule;
  return { ...resolved, turbopack: { ...turbopack, rules } };
}

/** Sends `/__deictic/*` to the endpoints' server, before any of the app's own rewrites. */
function withRewrite<C extends object>(resolved: C, port: number): C {
  const theirs = (resolved as { rewrites?: () => Promise<Rewrites> }).rewrites;
  const ours = [{ source: '/__deictic/:path*', destination: `http://127.0.0.1:${port}/__deictic/:path*` }];
  const rewrites = async (): Promise<Rewrites> => {
    const r = (await theirs?.()) ?? [];
    return Array.isArray(r) ? { beforeFiles: ours, afterFiles: r } : { ...r, beforeFiles: [...ours, ...(r.beforeFiles ?? [])] };
  };
  return { ...resolved, rewrites };
}

/** Serves the endpoints on a free local port, for as long as the process lives. */
function serve(root: string, plugins: ServerPlugin[], base: string): Promise<number> {
  const running = serving.get(root);
  if (running !== undefined) return running;
  const handle = endpoints({
    root,
    plugins,
    // Rewritten from under the base, but served at the root of their own server.
    base: '/',
    open: (path, { line, column }) =>
      redirect(`${base}__nextjs_launch-editor?${new URLSearchParams({ file: path, line1: String(line), column1: String(column) })}`),
  });
  const middleware = nodeMiddleware(handle);
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  const port = new Promise<number>((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => done((server.address() as AddressInfo).port));
  });
  // Not keeping the process alive past Next's own server.
  server.unref();
  serving.set(root, port);
  return port;
}

export default withDeictic;
