/**
 * `deictic/vite`: deictic in Vite's dev server. Nothing runs in a build, unless `standalone` asks for it.
 *
 * Its transform runs `pre`, so each JSX module's host elements are marked with their place in the
 * source as written (`tools/locate.ts`). In the browser each marked module also imports the client
 * module, which starts the overlay with every plugin's panel: imports run first and only once, so no
 * line moves and frameworks that render their own HTML get it too. The endpoints are middleware on
 * Vite's server, and a place opens through Vite's own `/__open-in-editor`, so the editor is whichever
 * Vite already launches. A write reaches the page through Vite's usual update for the file.
 *
 * A build may have deictic more than once: the app's, and one a package added with its own plugin (`defaults`).
 * The first in Vite's list does the work with all of their options merged (`merge`); the others do nothing.
 */
import { resolve } from 'node:path';

import type { Plugin } from 'vite';

import { type Endpoints, endpoints, nodeMiddleware, redirect } from './tools/endpoints.ts';
import { clientModule, type DeicticOptions, mark, markAstro, merge, prepare } from './tools/integration.ts';

export { clientModule, type DeicticOptions };

export interface ViteOptions extends DeicticOptions {
  /**
   * deictic in a build too, for a page that shows it with no dev server behind it (a deployed demo): a module of
   * the page's, from the root, whose default export answers the overlay's requests there (a `Standalone`, from
   * `deictic`). The build's elements are marked and the overlay is in its bundle. The dev server answers as ever.
   * Without it, the default, nothing of deictic is in a build.
   */
  standalone?: string;
}

/** The client module's ID, which a page can import itself where nothing it bundles is JSX (Astro's pages). */
export const CLIENT = 'virtual:deictic/client';
const CLIENT_ID = '\0deictic/client';

/** What each deictic in Vite's list carries, for the first of them to find the others by. */
interface Carried {
  deictic: { options: ViteOptions; id: symbol };
}

const carriedBy = (plugin: { api?: unknown }) => (plugin.api as Partial<Carried> | undefined)?.deictic;

export function deictic(given: ViteOptions = {}): Plugin {
  const id = Symbol('deictic');
  let options = given;
  let { plugins, shortcut, webmcp } = prepare(given);
  let leading = true;
  let handle: Endpoints | undefined;
  let root = '';
  let base = '/';
  let building = false;
  return {
    name: 'deictic',
    enforce: 'pre',
    apply: (_, { command }) => command === 'serve' || given.standalone !== undefined,
    api: { deictic: { options: given, id } } satisfies Carried,
    // The client is the app's to bundle as it changes, not a dependency to prebundle once.
    config: () => ({ optimizeDeps: { exclude: ['deictic'] } }),
    configResolved(config) {
      root = config.root;
      base = config.base;
      building = config.command === 'build';
      const all = config.plugins.flatMap((p) => carriedBy(p) ?? []);
      leading = all[0]?.id === id;
      if (!leading || all.length === 1) return;
      options = merge(all.map((c) => c.options));
      ({ plugins, shortcut, webmcp } = prepare(options));
    },
    configureServer(server) {
      if (!leading) return;
      handle = endpoints({
        root,
        plugins,
        base,
        open: (path, { line, column }) => redirect(`${base}__open-in-editor?${new URLSearchParams({ file: `${path}:${line}:${column}` })}`),
      });
      server.middlewares.use(nodeMiddleware(handle));
    },
    // Vite's dev server runs it as it closes, once per environment, and a build at its end, with no endpoints.
    async closeBundle() {
      await handle?.close();
    },
    resolveId: (source) => (leading && source === CLIENT ? CLIENT_ID : undefined),
    load(module) {
      if (!leading || module !== CLIENT_ID) return undefined;
      // Only a build's page asks the module: the dev server is there to answer.
      const server = building && options.standalone !== undefined ? resolve(root, options.standalone).replaceAll('\\', '/') : undefined;
      return clientModule(plugins, base, shortcut, { ...(server === undefined ? {} : { server }), webmcp });
    },
    transform: {
      // First of all, not only first of the `pre` plugins: the React Compiler (`react({ compiler: true })`) is
      // `pre` too and compiles the JSX away, so after it there'd be no element to mark, wherever deictic is listed.
      order: 'pre',
      handler(code, module) {
        if (!leading) return undefined;
        const [path = ''] = module.split('?');
        // An `.astro` component itself, not the styles and scripts Astro loads from it by a query.
        if (path.endsWith('.astro')) return module === path ? markAstro(code, path, root) : undefined;
        const browser = this.environment.config.consumer === 'client';
        return mark(code, path, root, browser ? `\nimport ${JSON.stringify(CLIENT)};\n` : '');
      },
    },
  };
}

export default deictic;
