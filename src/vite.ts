/**
 * `deictic/vite`: deictic in Vite's dev server. Nothing runs in a build.
 *
 * Its transform runs `pre`, so each JSX module's host elements are marked with their place in the
 * source as written (`tools/locate.ts`). In the browser each marked module also imports the client
 * module, which starts the overlay with every plugin's panel: imports run first and only once, so no
 * line moves and frameworks that render their own HTML get it too. The endpoints are middleware on
 * Vite's server, and a place opens through Vite's own `/__open-in-editor`, so the editor is whichever
 * Vite already launches. A write reaches the page through Vite's usual update for the file.
 */
import type { Plugin } from 'vite';

import { endpoints, nodeMiddleware, redirect } from './tools/endpoints.ts';
import { clientModule, type DeicticOptions, mark, prepare } from './tools/integration.ts';

export { clientModule, type DeicticOptions };

/** The client module's ID, which a page can import itself where nothing it bundles is JSX (Astro's pages). */
export const CLIENT = 'virtual:deictic/client';
const CLIENT_ID = '\0deictic/client';

export function deictic(options: DeicticOptions = {}): Plugin {
  const { plugins, shortcut } = prepare(options);
  let root = '';
  let base = '/';
  return {
    name: 'deictic',
    enforce: 'pre',
    apply: 'serve',
    // The client is the app's to bundle as it changes, not a dependency to prebundle once.
    config: () => ({ optimizeDeps: { exclude: ['deictic'] } }),
    configResolved(config) {
      root = config.root;
      base = config.base;
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
    load: (id) => (id === CLIENT_ID ? clientModule(plugins, base, shortcut) : undefined),
    transform(code, id) {
      const [path = ''] = id.split('?');
      const browser = this.environment.config.consumer === 'client';
      return mark(code, path, root, browser ? `\nimport ${JSON.stringify(CLIENT)};\n` : '');
    },
  };
}

export default deictic;
