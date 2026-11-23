/**
 * `deictic/webpack`: deictic in webpack's dev server, or Rspack's (`@rspack/core` takes the same
 * plugin). Nothing runs out of development mode.
 *
 * A loader (`loader.ts`) runs `pre` on the project's JSX modules, marking each host element with its
 * place in the source as written, and in a build for the browser appending the import of the client
 * module, which webpack has no virtual module for, so it's written to `.deictic/client.js`. The
 * endpoints go in front of the dev server's own middleware (`devServer.setupMiddlewares`, which
 * webpack-dev-server and Rspack's both read), and a place opens with `launch-editor`, as webpack has no
 * launcher of its own. Where the dev server is started by hand, or by Rsbuild, `middleware` is the
 * endpoints to mount there.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ServerPlugin } from './index.ts';
import type { LoaderOptions } from './loader.ts';
import type { Shortcut } from './shortcut.ts';
import { openInEditor } from './tools/editor.ts';
import { endpoints, nodeMiddleware } from './tools/endpoints.ts';
import { beside, type DeicticOptions, prepare, writeClient } from './tools/integration.ts';
import { JSX } from './tools/locate.ts';

export interface DeicticWebpackOptions extends DeicticOptions {
  /** The project's root, which marks and edits are from: the compiler's `context` by default. */
  root?: string;
  /** The path the page is served under, ending in `/`: `/` by default. */
  base?: string;
}

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
type Middlewares = ({ name: string; middleware: Middleware } | Middleware)[];

/** What the plugin reads and sets of a webpack or Rspack compiler. */
interface Compiler {
  context: string;
  options: {
    mode?: string;
    target?: string | string[] | false;
    module: { rules: unknown[] };
    devServer?: { setupMiddlewares?: (middlewares: Middlewares, server: unknown) => Middlewares } & Record<string, unknown>;
  };
}

const loaderPath = beside(import.meta.url, 'loader');

/** Whether a target runs in a browser: webpack's default does, as do `web` and `browserslist`; Node's and Electron's main don't. */
const forBrowser = (target: Compiler['options']['target']) =>
  target === undefined || [target].flat().some((t) => t !== false && !/^(async-)?node|^electron-main|^electron-preload/.test(t));

export class DeicticPlugin {
  readonly #options: DeicticWebpackOptions;
  readonly #plugins: ServerPlugin[];
  readonly #shortcut: Shortcut | false | undefined;
  #middleware: Middleware | undefined;
  #root = '';

  constructor(options: DeicticWebpackOptions = {}) {
    this.#options = options;
    // Now, so a wrong set of plugins stops the dev server as it starts, rather than the page.
    ({ plugins: this.#plugins, shortcut: this.#shortcut } = prepare(options));
  }

  /** The endpoints as Node middleware, once the plugin is applied: for a dev server started by hand. */
  get middleware(): Middleware {
    if (this.#middleware !== undefined) return this.#middleware;
    if (this.#root === '') throw new Error('deictic: give the plugin to the compiler before mounting its middleware');
    const root = this.#root;
    const handle = endpoints({
      root,
      plugins: this.#plugins,
      base: this.#options.base ?? '/',
      open: (path, loc) => openInEditor(path, loc),
    });
    return (this.#middleware = nodeMiddleware(handle));
  }

  apply(compiler: Compiler): void {
    // Development only: a build without a mode is webpack's production one.
    if (compiler.options.mode !== 'development') return;
    this.#root = this.#options.root ?? compiler.context;
    const browser = forBrowser(compiler.options.target);
    const client = browser
      ? writeClient(this.#root, this.#plugins, this.#options.base ?? '/', this.#shortcut, this.#options.view)
      : undefined;
    const options: LoaderOptions = { root: this.#root, ...(client === undefined ? {} : { client }) };
    // First, and `pre`, so it sees the source as written whatever the app's own rules do.
    compiler.options.module.rules.unshift({
      test: JSX,
      exclude: /[\\/]node_modules[\\/]/,
      enforce: 'pre',
      use: [{ loader: loaderPath, options }],
    });
    if (!browser) return;

    const devServer = (compiler.options.devServer ??= {});
    const theirs = devServer.setupMiddlewares;
    devServer.setupMiddlewares = (middlewares, server) => {
      const all = theirs === undefined ? middlewares : theirs(middlewares, server);
      // In front of the dev server's own, which would answer `/__deictic/` with the page or a 404.
      all.unshift({ name: 'deictic', middleware: this.middleware });
      return all;
    };
  }
}

/** The plugin, as a function: `plugins: [deictic({ plugins: [tailwind()] })]`. */
export const deictic = (options: DeicticWebpackOptions = {}) => new DeicticPlugin(options);

export default deictic;
