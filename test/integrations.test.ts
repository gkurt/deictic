import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { rspack } from '@rspack/core';
import react from '@vitejs/plugin-react';
import { createServer as createVite } from 'vite';

import { deictic as astro } from '#src/astro.ts';
import { deictic as bun } from '#src/bun.ts';
import { definePlugin } from '#src/index.ts';
import loader, { type LoaderOptions } from '#src/loader.ts';
import { withDeictic } from '#src/next.ts';
import { merge } from '#src/tools/integration.ts';
import { deictic as vite } from '#src/vite.ts';
import { DeicticPlugin } from '#src/webpack.ts';

import { project } from './fixture.ts';

const APP = 'export const App = () => <main className="p-4"><Card /></main>;\nconst Card = () => <p>Hi</p>;\n';
const pin = definePlugin({ name: 'pin', client: 'pin/client', clientOptions: { colour: 'red' } });
// What a package adds with deictic itself, beside the app's own: its pin gives way to the app's.
const added = {
  defaults: true,
  plugins: [definePlugin({ name: 'copy', client: 'copy/client' }), definePlugin({ name: 'pin', client: 'their/pin' })],
};
const both = (client: string) => {
  expect(client).toContain('import p0 from "pin/client";');
  expect(client).toContain('import p1 from "copy/client";');
  expect(client).not.toContain('their/pin');
};

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

/** A middleware on a server of its own, as a dev server mounts it: its URL. */
async function served(middleware: Middleware): Promise<{ url: string; close: () => void }> {
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end('not ours');
    }),
  );
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

/** Runs the loader as a bundler would, on a file of the project. */
function load(options: LoaderOptions, resourcePath: string, source: string) {
  let out: string | undefined;
  loader.call({ getOptions: () => options, resourcePath, callback: (_, code) => (out = code) }, source);
  return out!;
}

describe('webpack and Rspack', () => {
  type Rule = { test: RegExp; enforce: string; use: { loader: string; options: LoaderOptions }[] };
  const compilerFor = (root: string, mode: string | undefined, target?: string) => {
    const shutdown: (() => Promise<void>)[] = [];
    return {
      context: root,
      hooks: { shutdown: { tapPromise: (_: string, run: () => Promise<void>) => void shutdown.push(run) } },
      options: { mode, target, module: { rules: [] as unknown[] }, devServer: undefined as never },
      // What webpack's `close()` runs.
      close: () => Promise.all(shutdown.map((run) => run())),
    };
  };

  test('marks JSX first, imports the written client in the browser, and serves the endpoints in front', async () => {
    const p = project({ 'src/App.jsx': APP });
    const compiler = compilerFor(p.root, 'development');
    let closed = 0;
    const closing = definePlugin({ name: 'closing', setup: ({ onClose }) => onClose(() => void closed++) });
    new DeicticPlugin({ plugins: [pin, closing] }).apply(compiler);
    const [rule] = compiler.options.module.rules as Rule[];
    expect(rule!.enforce).toBe('pre');
    expect(rule!.test.test('src/App.tsx')).toBe(true);
    const client = rule!.use[0]!.options.client!;
    expect(client.replaceAll('\\', '/')).toEndWith('/.deictic/client.js');
    expect(readFileSync(client, 'utf8')).toContain('import p0 from "pin/client";');

    // The dev server's own middleware stays, behind ours.
    const theirs = { name: 'theirs', middleware: (() => {}) as Middleware };
    const all = (
      compiler.options.devServer as { setupMiddlewares: (m: unknown[], s: unknown) => { name: string; middleware: Middleware }[] }
    ).setupMiddlewares([theirs], {});
    expect(all.map((m) => m.name)).toEqual(['deictic', 'theirs']);
    const server = await served(all[0]!.middleware);
    try {
      expect((await fetch(`${server.url}/__deictic/history`)).status).toBe(200);
      expect(await (await fetch(`${server.url}/somewhere`)).text()).toBe('not ours');
      await compiler.close();
      expect(closed).toBe(1);
    } finally {
      server.close();
    }
  });

  test('marks without the client for a server build, and does nothing out of development mode', () => {
    const p = project({ 'src/App.jsx': APP });
    const node = compilerFor(p.root, 'development', 'node');
    new DeicticPlugin().apply(node);
    expect((node.options.module.rules as Rule[])[0]!.use[0]!.options).toEqual({ root: p.root });
    expect(node.options.devServer).toBeUndefined();
    for (const mode of ['production', undefined]) {
      const built = compilerFor(p.root, mode);
      new DeicticPlugin().apply(built);
      expect(built.options.module.rules).toEqual([]);
    }
  });

  test('given twice, marks once, and its client and endpoints have both', async () => {
    const p = project({ 'src/App.jsx': APP });
    const compiler = compilerFor(p.root, 'development');
    new DeicticPlugin(added).apply(compiler);
    const app = new DeicticPlugin({ plugins: [pin] });
    app.apply(compiler);
    const rules = compiler.options.module.rules as Rule[];
    expect(rules).toHaveLength(1);
    both(readFileSync(rules[0]!.use[0]!.options.client!, 'utf8'));
    const server = await served(app.middleware);
    try {
      expect((await fetch(`${server.url}/__deictic/history`)).status).toBe(200);
    } finally {
      server.close();
    }
  });

  test('Rspack compiles a marked JSX module that starts the overlay', async () => {
    const p = project({ 'src/App.jsx': APP, 'src/main.js': "import { App } from './App.jsx';\nconsole.log(App);\n" });
    const compiler = rspack({
      mode: 'development',
      context: p.root,
      entry: './src/main.js',
      output: { path: join(p.root, 'dist') },
      devtool: false,
      module: {
        rules: [{ test: /\.jsx$/, loader: 'builtin:swc-loader', options: { jsc: { parser: { syntax: 'ecmascript', jsx: true } } } }],
      },
      // deictic's page half and the plugins' are the app's dependencies; only what the plugin hands over is under test.
      externals: [/^deictic(\/|$)/, /^pin\//],
      plugins: [new DeicticPlugin({ plugins: [pin] })],
    });
    const error = await new Promise<string | undefined>((done) =>
      compiler.run((e, stats) => compiler.close(() => done(e?.message ?? (stats?.hasErrors() ? stats.toString() : undefined)))),
    );
    expect(error).toBeUndefined();
    const js = readFileSync(join(p.root, 'dist/main.js'), 'utf8');
    expect(js).toContain('"data-deictic": "src/App.jsx:1:26"');
    expect(js).toContain('"data-deictic": "src/App.jsx:2:20"');
    expect(js).toContain('.deictic/client.js');
    // The written client module, bundled with the page, starting the overlay with the plugin's half.
    expect(js).toMatch(/start\)?\(\{ base: "\/", shortcut: .*plugin: pin_client/);
  }, 30_000);
});

describe('webpack and Rspack, with the React Compiler', () => {
  test("marks JSX before the app's babel-loader compiles it with the React Compiler", async () => {
    const p = project({ 'src/main.jsx': APP });
    const compiler = rspack({
      mode: 'development',
      context: p.root,
      entry: './src/main.jsx',
      output: { path: join(p.root, 'dist') },
      devtool: false,
      module: {
        rules: [
          {
            test: /\.jsx$/,
            loader: 'babel-loader',
            options: {
              babelrc: false,
              configFile: false,
              plugins: ['babel-plugin-react-compiler'],
              presets: [['@babel/preset-react', { runtime: 'automatic' }]],
            },
          },
        ],
      },
      externals: [/^deictic(\/|$)/, /^react(\/|$)/],
      plugins: [new DeicticPlugin()],
    });
    const error = await new Promise<string | undefined>((done) =>
      compiler.run((e, stats) => compiler.close(() => done(e?.message ?? (stats?.hasErrors() ? stats.toString() : undefined)))),
    );
    expect(error).toBeUndefined();
    const js = readFileSync(join(p.root, 'dist/main.js'), 'utf8');
    expect(js).toContain('"data-deictic": "src/main.jsx:1:26"');
    expect(js).toContain('.deictic/client.js');
    // And the compiler still ran on what deictic marked.
    expect(js).toContain('react/compiler-runtime');
  }, 30_000);
});

describe('Next', () => {
  type Rule = { condition: unknown; loaders: { loader: string; options: LoaderOptions }[] };
  type Config = {
    basePath?: string;
    turbopack?: { rules?: Record<string, Rule | Rule[]> };
    rewrites?: () => Promise<{ beforeFiles: unknown[] }>;
    webpack?: (config: { module: { rules: unknown[] } }, context: { isServer: boolean }) => { module: { rules: unknown[] } };
  };

  test('in dev, marks JSX on both sides, starts the overlay in the browser, and rewrites to its endpoints', async () => {
    const p = project({ 'app/page.tsx': APP });
    const theirs = { condition: 'browser', loaders: [{ loader: 'svg', options: {} }] };
    const next = await withDeictic<Config>(
      { basePath: '/docs', turbopack: { rules: { '*.tsx': theirs as never } } },
      { root: p.root, plugins: [pin] },
    )('phase-development-server', { defaultConfig: {} });
    const [kept, browser, server] = next.turbopack!.rules!['*.tsx'] as Rule[];
    expect(kept).toBe(theirs as never);
    expect(browser!.condition).toEqual({ all: ['browser', { not: 'foreign' }] });
    expect(server!.condition).toEqual({ all: [{ not: 'browser' }, { not: 'foreign' }] });
    const page = join(p.root, 'app/page.tsx');
    const inBrowser = load(browser!.loaders[0]!.options, page, APP);
    expect(inBrowser).toContain('<main data-deictic="app/page.tsx:1:26"');
    expect(inBrowser).toContain('.deictic/client.js');
    expect(readFileSync(browser!.loaders[0]!.options.client!, 'utf8')).toContain('start({ base: "/docs/"');
    expect(load(server!.loaders[0]!.options, page, APP)).not.toContain('.deictic/client.js');

    // For `next dev --webpack`: the same loader, first and `pre`, the client only in the browser's build.
    const [rule] = next.webpack!({ module: { rules: ['theirs'] } }, { isServer: false }).module.rules as {
      enforce: string;
      use: { options: LoaderOptions }[];
    }[];
    expect(rule!.enforce).toBe('pre');
    expect(rule!.use[0]!.options.client).toBe(browser!.loaders[0]!.options.client);
    expect(next.webpack!({ module: { rules: [] } }, { isServer: true }).module.rules).toHaveLength(1);

    const { beforeFiles } = await next.rewrites!();
    const [rewrite] = beforeFiles as { source: string; destination: string }[];
    expect(rewrite!.source).toBe('/__deictic/:path*');
    const origin = new URL(rewrite!.destination).origin;
    expect((await fetch(`${origin}/__deictic/history`)).status).toBe(200);
    const open = await fetch(`${origin}/__deictic/open?file=app/page.tsx&line=1&column=30`, { redirect: 'manual' });
    // To Next's own launcher, under the base path, with the file's whole path.
    const launch = new URL(open.headers.get('location')!, origin);
    expect(launch.pathname).toBe('/docs/__nextjs_launch-editor');
    expect(Object.fromEntries(launch.searchParams)).toEqual({ file: join(p.root, 'app/page.tsx'), line1: '1', column1: '30' });
  });

  test('wrapped twice, has its rules and rewrite once, and its client has both', async () => {
    const p = project({ 'app/page.tsx': APP });
    const next = await withDeictic<Config>(withDeictic<Config>({}, { ...added, root: p.root }), { root: p.root, plugins: [pin] })(
      'phase-development-server',
      { defaultConfig: {} },
    );
    const rules = next.turbopack!.rules!['*.tsx'] as Rule[];
    expect(rules).toHaveLength(2);
    both(readFileSync(rules[0]!.loaders[0]!.options.client!, 'utf8'));
    expect((await next.rewrites!()).beforeFiles).toHaveLength(1);
  });

  test('leaves a build as it is, and the loader leaves dependencies and files outside the project alone', async () => {
    const config = { reactStrictMode: true };
    expect(await withDeictic(config)('phase-production-build', { defaultConfig: config })).toBe(config);
    const p = project({ 'app/page.tsx': APP });
    expect(load({ root: p.root }, join(p.root, 'node_modules/ui/button.tsx'), APP)).toBe(APP);
    expect(load({ root: join(p.root, 'app') }, join(p.root, 'page.tsx'), APP)).toBe(APP);
  });
});

describe('Bun', () => {
  type OnLoad = (args: { path: string; side?: string }) => Promise<{ contents: string; loader: string } | undefined>;
  const setUp = (plugin: ReturnType<typeof bun>, config: object) => {
    let onLoad: OnLoad | undefined;
    void plugin.setup({ config, onLoad: (_: unknown, run: OnLoad) => (onLoad = run) } as never);
    return onLoad;
  };

  test('marks JSX for the dev server, with the client in the browser, and answers its routes', async () => {
    const p = project({ 'src/App.tsx': APP });
    const plugin = bun({ root: p.root, plugins: [pin] });
    const onLoad = setUp(plugin, {})!;
    const path = join(p.root, 'src/App.tsx');
    const page = await onLoad({ path, side: 'client' });
    expect(page!.loader).toBe('tsx');
    expect(page!.contents).toContain('<main data-deictic="src/App.tsx:1:26"');
    expect(page!.contents).toContain('.deictic/client.js');
    expect((await onLoad({ path, side: 'server' }))!.contents).not.toContain('.deictic/client.js');
    expect(await onLoad({ path: join(p.root, 'node_modules/ui/x.tsx') })).toBeUndefined();

    const route = plugin.routes['/__deictic/*']!;
    expect((await route(new Request('http://localhost:3000/__deictic/history'))).status).toBe(200);
  });

  test('named twice in bunfig, marks once, and its client has both', async () => {
    const p = project({ 'src/App.tsx': APP });
    const theirs = bun({ ...added, root: p.root });
    const app = bun({ root: p.root, plugins: [pin] });
    const onLoad = setUp(theirs, {})!;
    expect(setUp(app, {})).toBeUndefined();
    await onLoad({ path: join(p.root, 'src/App.tsx'), side: 'client' });
    both(readFileSync(join(p.root, '.deictic/client.js'), 'utf8'));
  });

  test('does nothing in a build', () => {
    const p = project({ 'src/App.tsx': APP });
    expect(setUp(bun({ root: p.root }), { entrypoints: ['src/App.tsx'] })).toBeUndefined();
  });
});

describe('Vite', () => {
  test('marks JSX before the React Compiler compiles it away, wherever deictic is listed', async () => {
    const p = project({
      'src/App.tsx': `${APP}export const Page = () => <App />;
`,
    });
    const server = await createVite({
      root: p.root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [react({ compiler: true }), vite()],
    });
    try {
      const code = (await server.transformRequest('/src/App.tsx'))!.code;
      expect(code).toContain('"data-deictic": "src/App.tsx:1:26"');
      expect(code).toContain('__x00__deictic/client'); // the client's import, as Vite rewrites it
      // And the compiler still ran on what deictic marked.
      expect(code).toContain('compiler-runtime');
    } finally {
      await server.close();
    }
  }, 30_000);

  test("runs what the plugins' setups left for the close as the dev server closes", async () => {
    const p = project({ 'src/App.tsx': APP });
    let closed = 0;
    const closing = definePlugin({ name: 'closing', setup: ({ onClose }) => onClose(() => void closed++) });
    const server = await createVite({
      root: p.root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [vite({ plugins: [closing] })],
    });
    await server.close();
    expect(closed).toBe(1);
  });
});

describe('Vite, given deictic twice', () => {
  test('the first marks, with every plugin given in its client', async () => {
    const p = project({ 'src/App.tsx': APP });
    const server = await createVite({
      root: p.root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [vite(added), vite({ plugins: [pin] })],
    });
    try {
      const code = (await server.transformRequest('/src/App.tsx'))!.code;
      expect(code.match(/"data-deictic": "src\/App.tsx:1:26"/g)).toHaveLength(1);
      expect(code.match(/__x00__deictic\/client/g)).toHaveLength(1);
      const client = await server.environments.client.pluginContainer.load('\0deictic/client');
      both(typeof client === 'string' ? client : String(client?.code));
    } finally {
      await server.close();
    }
  }, 30_000);

  test('two that set the shortcut two ways are refused', () => {
    expect(() => merge([{ shortcut: { modifiers: ['Alt'] } }, { shortcut: { modifiers: ['Shift'] } }])).toThrow(/shortcut set two ways/);
    expect(merge([{ shortcut: false, defaults: true }, { shortcut: { modifiers: ['Shift'] } }]).shortcut).toEqual({ modifiers: ['Shift'] });
  });
});

describe('Astro', () => {
  test('adds the Vite plugin and the overlay to every page in dev, and nothing to a build', () => {
    const calls: unknown[] = [];
    const setup = astro().hooks['astro:config:setup'];
    const record = (command: 'dev' | 'build') =>
      setup({
        command,
        updateConfig: (c) => calls.push(c.vite.plugins.map((v) => (v as { name: string }).name)),
        injectScript: (_, s) => calls.push(s),
      });
    record('build');
    expect(calls).toEqual([]);
    record('dev');
    expect(calls).toEqual([['deictic'], 'import "virtual:deictic/client";']);
  });
});
