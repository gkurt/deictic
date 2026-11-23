/**
 * `deictic/vite`: deictic in Vite's dev server. Nothing runs in a build, unless `standalone` asks for it.
 *
 * Its transform runs `pre`, so each JSX module's host elements are marked with their place in the
 * source as written (`tools/locate.ts`). In the browser each marked module also imports the client
 * module, which starts the overlay with every plugin's panel: imports run first and only once, so no
 * line moves and frameworks that render their own HTML get it too. The endpoints are middleware on
 * Vite's server, and a place opens through Vite's own `/__open-in-editor`, so the editor is whichever
 * Vite already launches. A write reaches the page through Vite's usual update for the file.
 */
import { resolve } from 'node:path';

import type { Plugin } from 'vite';

import { endpoints, nodeMiddleware, redirect } from './tools/endpoints.ts';
import { clientModule, type DeicticOptions, mark, markAstro, prepare } from './tools/integration.ts';

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

export function deictic(options: ViteOptions = {}): Plugin {
  const { plugins, shortcut, view } = prepare(options);
  let root = '';
  let base = '/';
  let building = false;
  return {
    name: 'deictic',
    enforce: 'pre',
    apply: (_, { command }) => command === 'serve' || options.standalone !== undefined,
    // The client is the app's to bundle as it changes, not a dependency to prebundle once.
    config: () => ({ optimizeDeps: { exclude: ['deictic'] } }),
    configResolved(config) {
      root = config.root;
      base = config.base;
      building = config.command === 'build';
    },
    configureServer(server) {
      const handle = endpoints({
        root,
        plugins,
        base,
        open: (path, { line, column }) => redirect(`${base}__open-in-editor?${new URLSearchParams({ file: `${path}:${line}:${column}` })}`),
      });
      server.middlewares.use(nodeMiddleware(handle));
    },
    resolveId: (id) => (id === CLIENT ? CLIENT_ID : undefined),
    load(id) {
      if (id !== CLIENT_ID) return undefined;
      // Only a build's page asks the module: the dev server is there to answer.
      const server = building && options.standalone !== undefined ? resolve(root, options.standalone).replaceAll('\\', '/') : undefined;
      return clientModule(plugins, base, shortcut, server, view);
    },
    transform: {
      // First of all, not only first of the `pre` plugins: the React Compiler (`react({ compiler: true })`) is
      // `pre` too and compiles the JSX away, so after it there'd be no element to mark, wherever deictic is listed.
      order: 'pre',
      handler(code, id) {
        const [path = ''] = id.split('?');
        // An `.astro` component itself, not the styles and scripts Astro loads from it by a query.
        if (path.endsWith('.astro')) return id === path ? markAstro(code, path, root) : undefined;
        const browser = this.environment.config.consumer === 'client';
        return mark(code, path, root, browser ? `\nimport ${JSON.stringify(CLIENT)};\n` : '');
      },
    },
  };
}

export default deictic;
