/**
 * `deictic/bun`: deictic in Bun's dev server, the bundler `Bun.serve` runs for HTML imports. Nothing
 * runs in `Bun.build`.
 *
 * Named in bunfig.toml's `[serve.static] plugins`, it marks each JSX module as it loads, and in the
 * browser appends the import of the client module, written to `.deictic/client.js`, as Bun has no
 * virtual modules for it. A bundler plugin can't add routes to the server, so the endpoints are the
 * plugin's `routes`, spread into `Bun.serve`'s; a place opens in the editor `Bun.openInEditor` finds.
 *
 * bunfig names a module whose default export is the plugin, so the plugin lives in a file of its own,
 * which the server imports too, for its routes:
 *
 *   // deictic.ts
 *   export default deictic({ plugins: [tailwind()] });
 *   // server.ts
 *   import tools from './deictic.ts';
 *   Bun.serve({ routes: { ...tools.routes, '/*': index }, development: true });
 */
import { resolve } from 'node:path';

import type { BunPlugin } from 'bun';

import { endpoints } from './tools/endpoints.ts';
import { type DeicticOptions, importOf, mark, prepare, writeClient } from './tools/integration.ts';
import { JSX } from './tools/locate.ts';

export interface DeicticBunOptions extends DeicticOptions {
  /** The project's root, which marks and edits are from: the working directory by default. */
  root?: string;
}

export type DeicticBunPlugin = BunPlugin & {
  /** The endpoints, as `Bun.serve` routes: `routes: { ...plugin.routes, '/*': index }`. */
  routes: Record<string, (req: Request) => Promise<Response>>;
};

export function deictic(options: DeicticBunOptions = {}): DeicticBunPlugin {
  // Now, so a wrong set of plugins stops the dev server as it starts, rather than the page.
  const { plugins, shortcut } = prepare(options);
  const root = resolve(options.root ?? process.cwd());
  let handle: ((req: Request) => Promise<Response | undefined>) | undefined;
  const route = async (req: Request) => {
    handle ??= endpoints({
      root,
      plugins,
      open: (path, { line, column }) => {
        try {
          Bun.openInEditor(path, { line, column });
          return new Response(null, { status: 204 });
        } catch (e) {
          return new Response(`${e instanceof Error ? e.message : String(e)}: set VISUAL or EDITOR to the editor's command`, {
            status: 500,
          });
        }
      },
    });
    return (await handle(req)) ?? new Response(null, { status: 404 });
  };

  return {
    name: 'deictic',
    routes: { '/__deictic/*': route },
    setup(build) {
      // A build names its entry points; the dev server's bundler doesn't.
      if ('entrypoints' in build.config) return;
      const client = writeClient(root, plugins, '/', shortcut);
      // Bun names the side it loads a module for (undocumented, and not in Bun's types); the dev server's is the browser's.
      const forBrowser = (args: object) => !('side' in args) || args.side === 'client';
      build.onLoad({ filter: JSX }, async (args) => {
        // A dependency's is left to Bun, unread.
        if (/[\\/]node_modules[\\/]/.test(args.path)) return undefined;
        const code = await Bun.file(args.path).text();
        const marked = mark(code, args.path, root, forBrowser(args) ? importOf(client, args.path) : '');
        if (marked === undefined) return undefined;
        return { contents: marked.code, loader: args.path.endsWith('tsx') ? 'tsx' : 'jsx' };
      });
    },
  };
}
