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
 *
 * A compiler may be given deictic more than once: the app's, and one a package applied with its own plugin
 * (`defaults`). The first applied adds the rule and the middleware, and every one writes the client again with all
 * of their options merged (`merge`), so the last applied writes it whole before the compiler runs.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { LoaderOptions } from './loader.ts';
import { openInEditor } from './tools/editor.ts';
import { type Endpoints, endpoints, nodeMiddleware } from './tools/endpoints.ts';
import { beside, type DeicticOptions, merge, prepare, writeClient } from './tools/integration.ts';
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
  hooks: { shutdown: { tapPromise: (name: string, run: () => Promise<void>) => void } };
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

/** Every deictic one compiler was given, and the first of them, which serves the endpoints. */
interface Applied {
  given: DeicticWebpackOptions[];
  first: DeicticPlugin;
}

const appliedTo = new WeakMap<Compiler, Applied>();

export class DeicticPlugin {
  readonly #options: DeicticWebpackOptions;
  #applied: Applied | undefined;
  #middleware: Middleware | undefined;
  #endpoints: Endpoints | undefined;
  #root = '';

  constructor(options: DeicticWebpackOptions = {}) {
    this.#options = options;
    // Now, so a wrong set of plugins stops the dev server as it starts, rather than the page.
    prepare(options);
  }

  /** The options of every deictic the compiler was given, merged. */
  #merged(): DeicticWebpackOptions {
    const given = this.#applied?.given ?? [this.#options];
    return given.length === 1 ? given[0]! : merge(given);
  }

  /** The endpoints as Node middleware, once the plugin is applied: for a dev server started by hand. */
  get middleware(): Middleware {
    const applied = this.#applied;
    if (applied === undefined) throw new Error('deictic: give the plugin to the compiler before mounting its middleware');
    if (applied.first !== this) return applied.first.middleware;
    if (this.#middleware !== undefined) return this.#middleware;
    let handle: Middleware | undefined;
    // Made at the first request, once every deictic of the compiler has been applied.
    return (this.#middleware = (req, res, next) => {
      if (handle === undefined) {
        const merged = this.#merged();
        this.#endpoints = endpoints({
          root: this.#root,
          plugins: prepare(merged).plugins,
          base: merged.base ?? '/',
          open: (path, loc) => openInEditor(path, loc),
        });
        handle = nodeMiddleware(this.#endpoints);
      }
      handle(req, res, next);
    });
  }

  apply(compiler: Compiler): void {
    // Development only: a build without a mode is webpack's production one.
    if (compiler.options.mode !== 'development') return;
    let applied = appliedTo.get(compiler);
    if (applied === undefined) appliedTo.set(compiler, (applied = { given: [], first: this }));
    applied.given.push(this.#options);
    this.#applied = applied;
    const merged = this.#merged();
    const { plugins, shortcut } = prepare(merged);
    this.#root = merged.root ?? compiler.context;
    const browser = forBrowser(compiler.options.target);
    const client = browser ? writeClient(this.#root, plugins, merged.base ?? '/', shortcut) : undefined;
    if (applied.first !== this) return;
    // webpack's and Rspack's `close()`, which their dev servers call as they stop.
    compiler.hooks.shutdown.tapPromise('deictic', async () => {
      await this.#endpoints?.close();
    });
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
