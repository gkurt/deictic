import { expect, test } from 'bun:test';
import { join } from 'node:path';

import { addToBunfig, addToServer, PLUGIN } from '#src/cli/bun.ts';
import { addToConfig, bundlerOf, init, packagesFor } from '#src/cli/init.ts';
import { definePlugin } from '#src/index.ts';
import { recommended } from '#src/plugins/recommended/index.ts';
import { dom, screenshots } from '#src/plugins/screenshots/index.ts';
import { installCommand, missing, missingProblem, packageManager, specOf } from '#src/tools/packages.ts';

import { project } from './fixture.ts';

const manifest = (deps: Record<string, string> = {}) => JSON.stringify({ name: 'app', devDependencies: deps });

test("the package manager is the project's field, else its nearest lockfile, else the one running", () => {
  expect(packageManager(project({ 'package.json': JSON.stringify({ packageManager: 'pnpm@9.1.0' }), 'bun.lock': '' }).root)).toBe('pnpm');
  expect(packageManager(project({ 'package.json': manifest(), 'yarn.lock': '' }).root, 'npm/10.0.0')).toBe('yarn');
  // A workspace's lockfile is above the package.
  const workspace = project({ 'pnpm-lock.yaml': '', 'app/package.json': manifest() });
  expect(packageManager(join(workspace.root, 'app'))).toBe('pnpm');
});

test("the install command names deictic's ranges for its peers, quoted, and its own version for deictic", () => {
  const { root } = project({ 'package.json': manifest() });
  expect(specOf('rrweb')).toMatch(/^"rrweb@\^2\./);
  expect(specOf('deictic')).toMatch(/^"deictic@\^\d/);
  expect(specOf('left-pad')).toBe('left-pad');
  expect(installCommand('bun', ['left-pad'], root)).toBe('bun add -d left-pad');
  expect(installCommand('pnpm', ['left-pad'], project({ 'package.json': manifest(), 'pnpm-workspace.yaml': '' }).root)).toBe(
    'pnpm add -D -w left-pad',
  );
});

test("says which plugins' packages aren't installed, and the command that installs them", () => {
  const { root } = project({ 'package.json': manifest(), 'package-lock.json': '{}' });
  const plugins = [
    definePlugin({ name: 'one', packages: ['rrweb', 'deictic-nothing-here'] }),
    definePlugin({ name: 'two', packages: ['deictic-nothing-here', 'deictic-nor-here'] }),
    definePlugin({ name: 'three' }),
  ];
  // Found from the project: rrweb is the repository's, above it.
  expect(missing(root, plugins)).toEqual([
    { plugin: 'one', packages: ['deictic-nothing-here'] },
    { plugin: 'two', packages: ['deictic-nothing-here', 'deictic-nor-here'] },
  ]);
  expect(missingProblem(root, plugins)).toEqual({
    key: 'packages:deictic-nor-here,deictic-nothing-here',
    kind: 'setup',
    message: 'install what one and two need, then restart the dev server: npm install -D deictic-nothing-here deictic-nor-here',
  });
  expect(missingProblem(root, plugins.slice(2))).toBeUndefined();
});

test("each recommended plugin names what it imports, and screenshots its renderer's", () => {
  expect(packagesFor('vite')).toEqual([
    'deictic',
    '@vercel/board',
    'rrweb-snapshot',
    'playwright-core',
    'rrweb',
    'rrweb-player',
    '@rrweb/rrweb-plugin-console-record',
    '@rrweb/rrweb-plugin-network-record',
  ]);
  expect(packagesFor('webpack')).toContain('launch-editor');
  expect(screenshots({ renderer: dom() }).packages).toEqual(['modern-screenshot']);
  // Every one is a peer of deictic's, so the command pins its range.
  for (const name of recommended().flatMap((p) => p.packages ?? [])) expect(specOf(name)).toStartWith('"');
});

test('knows the bundler from the dependencies', () => {
  expect(bundlerOf(project({ 'package.json': manifest({ next: '16', react: '19' }) }).root)).toBe('next');
  expect(bundlerOf(project({ 'package.json': manifest({ astro: '7', vite: '8' }) }).root)).toBe('astro');
  expect(bundlerOf(project({ 'package.json': manifest(), 'vite.config.ts': '' }).root)).toBe('vite');
  expect(bundlerOf(project({ 'package.json': manifest({ '@rspack/cli': '2' }) }).root)).toBe('rspack');
  expect(bundlerOf(project({ 'package.json': manifest({ webpack: '5' }) }).root)).toBe('webpack');
  expect(bundlerOf(project({ 'package.json': manifest({ react: '19' }) }).root)).toBeUndefined();
});

test("adds the plugin first in Vite's plugins, as the config is laid out, and its imports after the config's", () => {
  const code = `import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react(),
  ],
})
`;
  expect(addToConfig('vite', 'vite.config.ts', code)).toBe(`import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { recommended } from "deictic/recommended"
import { deictic } from "deictic/vite"

export default defineConfig({
  plugins: [
    deictic({ plugins: recommended() }),
    react(),
  ],
})
`);
  expect(addToConfig('vite', 'vite.config.ts', `export default { plugins: [react()] };\n`)).toBe(
    `import { recommended } from 'deictic/recommended';\nimport { deictic } from 'deictic/vite';\n\nexport default { plugins: [deictic({ plugins: recommended() }), react()] };\n`,
  );
});

test("finds the config through a function, a const and satisfies, and adds the list where there's none", () => {
  const out = (code: string) => addToConfig('vite', 'vite.config.ts', code)?.split('\n').slice(2).join('\n');
  expect(out(`export default defineConfig(() => ({ server: { port: 1 } }));`)).toBe(
    `\nexport default defineConfig(() => ({ plugins: [deictic({ plugins: recommended() })], server: { port: 1 } }));`,
  );
  expect(out(`const config = { plugins: [] } satisfies UserConfig;\nexport default config;`)).toBe(
    `\nconst config = { plugins: [deictic({ plugins: recommended() })] } satisfies UserConfig;\nexport default config;`,
  );
  expect(out(`export default defineConfig(({ mode }) => {\n  return {};\n});`)).toBe(
    `\nexport default defineConfig(({ mode }) => {\n  return { plugins: [deictic({ plugins: recommended() })] };\n});`,
  );
  // Where it can't tell, nothing: plugins that aren't a list, a config of no shape it knows, one that doesn't parse.
  expect(addToConfig('vite', 'vite.config.ts', `export default { plugins: list };`)).toBeUndefined();
  expect(addToConfig('vite', 'vite.config.ts', `export default make();`)).toBeUndefined();
  expect(addToConfig('vite', 'vite.config.ts', `export default {`)).toBeUndefined();
});

test("looks inside defineConfig only: a merge's first argument is a base, and the plugin isn't the base's", () => {
  expect(
    addToConfig('vite', 'vite.config.ts', `export default mergeConfig({ plugins: [] }, defineConfig({ plugins: [] }));`),
  ).toBeUndefined();
  expect(
    addToConfig(
      'webpack',
      'webpack.config.js',
      `const { merge } = require('webpack-merge');\nmodule.exports = merge({ plugins: [] }, { mode: 'development' });`,
    ),
  ).toBeUndefined();
  expect(addToConfig('vite', 'vite.config.ts', `export default vite.defineConfig({});`)).toContain(
    'vite.defineConfig({ plugins: [deictic(',
  );
});

const server = `import index from './index.html';

Bun.serve({
  routes: {
    '/*': index,
  },
  development: true,
});
`;

test("is Bun's only where a server has Bun bundle a page, and Vite's or Next's where the project runs those on Bun", () => {
  // Bun runs it, but serves no page of its own: an API, a script.
  const api = {
    'package.json': manifest({ '@types/bun': '1' }),
    'bunfig.toml': '',
    'src/index.ts': 'Bun.serve({ fetch: () => new Response("ok") });\n',
  };
  expect(bundlerOf(project(api).root)).toBeUndefined();
  expect(bundlerOf(project({ 'package.json': manifest({ '@types/bun': '1' }), 'src/server.ts': server }).root)).toBe('bun');
  expect(bundlerOf(project({ 'package.json': manifest({ vite: '8', '@types/bun': '1' }), 'server.ts': server }).root)).toBe('vite');
  expect(bundlerOf(project({ 'package.json': manifest({ next: '16' }), 'bunfig.toml': '' }).root)).toBe('next');
  // Not in a dependency's server.
  expect(bundlerOf(project({ 'package.json': manifest(), 'node_modules/x/server.ts': server }).root)).toBeUndefined();
});

test("puts the plugin's module first in bunfig's [serve.static] plugins, as bunfig is written", () => {
  const entry = '"./deictic.plugin.ts"';
  expect(addToBunfig(undefined)).toBe(`[serve.static]\nplugins = [${entry}]\n`);
  expect(addToBunfig('[install]\nlinker = "isolated"\n')).toBe(`[install]\nlinker = "isolated"\n\n[serve.static]\nplugins = [${entry}]\n`);
  expect(addToBunfig('[serve.static]\nplugins = ["./tailwind.ts"]\n')).toBe(`[serve.static]\nplugins = [${entry}, "./tailwind.ts"]\n`);
  expect(addToBunfig('[serve.static]\nplugins = []\n')).toBe(`[serve.static]\nplugins = [${entry}]\n`);
  expect(addToBunfig('[serve.static]\nplugins = [\n  "./tailwind.ts",\n]\n')).toBe(
    `[serve.static]\nplugins = [\n  ${entry},\n  "./tailwind.ts",\n]\n`,
  );
  expect(addToBunfig('[serve.static]\nenv = "PUBLIC_*"\n\n[test]\nplugins = []\n')).toBe(
    `[serve.static]\nplugins = [${entry}]\nenv = "PUBLIC_*"\n\n[test]\nplugins = []\n`,
  );
  expect(addToBunfig(`[serve.static]\nplugins = [${entry}]\n`)).toBe(`[serve.static]\nplugins = [${entry}]\n`);
  // Said another way: where, it can't tell.
  expect(addToBunfig('serve.static.plugins = []\n')).toBeUndefined();
});

test("spreads the plugin's routes first in Bun.serve's, and imports its module from where the server is", () => {
  const root = join('/app');
  expect(addToServer(join(root, 'server.ts'), server, root)).toBe(`import index from './index.html';
import tools from './deictic.plugin.ts';

Bun.serve({
  routes: {
    ...tools.routes,
    '/*': index,
  },
  development: true,
});
`);
  const nested = addToServer(
    join(root, 'src', 'server.ts'),
    `import page from "./page.html"\nconst tools = 1\nBun.serve({ port: 3000 })\n`,
    root,
  );
  expect(nested).toBe(
    `import page from "./page.html"\nimport deicticTools from "../deictic.plugin.ts"\nconst tools = 1\nBun.serve({ routes: { ...deicticTools.routes }, port: 3000 })\n`,
  );
  // Two servers, or routes it can't see: where, it can't tell.
  expect(addToServer(join(root, 'server.ts'), `${server}Bun.serve({});\n`, root)).toBeUndefined();
  expect(addToServer(join(root, 'server.ts'), `import index from './index.html';\nBun.serve({ routes });\n`, root)).toBeUndefined();
});

test('init sets a Bun server up: the plugin module, bunfig and the routes, and leaves them as they are the next time', async () => {
  const app = project({ 'package.json': manifest({ '@types/bun': '1' }), 'bun.lock': '', 'server.ts': server });
  const lines: string[] = [];
  await init({ cwd: app.root, install: false, skill: false, log: (l) => lines.push(l) });
  expect(app.read('deictic.plugin.ts')).toBe(PLUGIN);
  expect(app.read('bunfig.toml')).toBe('[serve.static]\nplugins = ["./deictic.plugin.ts"]\n');
  expect(app.read('server.ts')).toContain('...tools.routes,');
  expect(lines).toContain('deictic: added its routes to server.ts');
  expect(lines.find((l) => l.startsWith('deictic: install them'))).not.toContain('launch-editor');

  lines.length = 0;
  await init({ cwd: app.root, install: false, skill: false, log: (l) => lines.push(l) });
  expect(lines).toContain('deictic: bunfig.toml has it already');
  expect(lines).toContain('deictic: server.ts has its routes already');
});

test("wraps Next's config, and requires in a CommonJS one", () => {
  expect(
    addToConfig(
      'next',
      'next.config.ts',
      `import type { NextConfig } from 'next';\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;\n`,
    ),
  ).toBe(
    `import type { NextConfig } from 'next';\nimport { recommended } from 'deictic/recommended';\nimport { withDeictic } from 'deictic/next';\n\nconst nextConfig: NextConfig = {};\n\nexport default withDeictic(nextConfig, { plugins: recommended() });\n`,
  );
  expect(addToConfig('next', 'next.config.js', `module.exports = { reactStrictMode: true };\n`)).toBe(
    `const { recommended } = require('deictic/recommended');\nconst { withDeictic } = require('deictic/next');\n\nmodule.exports = withDeictic({ reactStrictMode: true }, { plugins: recommended() });\n`,
  );
});

test("adds Astro's integration, and webpack's plugin after its requires", () => {
  expect(addToConfig('astro', 'astro.config.mjs', `import { defineConfig } from 'astro/config';\nexport default defineConfig({});\n`)).toBe(
    `import { defineConfig } from 'astro/config';\nimport { recommended } from 'deictic/recommended';\nimport { deictic } from 'deictic/astro';\nexport default defineConfig({ integrations: [deictic({ plugins: recommended() })] });\n`,
  );
  const webpack = `const path = require('path');\r\n\r\nmodule.exports = (env) => ({\r\n  entry: './src/index.js',\r\n  plugins: [],\r\n});\r\n`;
  expect(addToConfig('webpack', 'webpack.config.js', webpack)).toBe(
    `const path = require('path');\r\nconst { recommended } = require('deictic/recommended');\r\nconst { DeicticPlugin } = require('deictic/webpack');\r\n\r\nmodule.exports = (env) => ({\r\n  entry: './src/index.js',\r\n  plugins: [new DeicticPlugin({ plugins: recommended() })],\r\n});\r\n`,
  );
});

test('init installs what the project lacks with its manager, adds deictic to the config, and says how to add the skill', async () => {
  const app = project({
    'package.json': manifest({ vite: '8', rrweb: '2.2.2' }),
    'pnpm-lock.yaml': '',
    'vite.config.ts': `export default { plugins: [] };\n`,
  });
  const lines: string[] = [];
  const ran: string[] = [];
  await init({ cwd: app.root, log: (l) => lines.push(l), run: (c) => ran.push(c) > 0, skill: false });
  expect(ran).toHaveLength(1);
  expect(ran[0]).toStartWith('pnpm add -D "deictic@^');
  expect(ran[0]).not.toContain('"rrweb@');
  expect(ran[0]).toContain('"rrweb-player@');
  expect(app.read('vite.config.ts')).toContain('plugins: [deictic({ plugins: recommended() })]');
  expect(lines.some((l) => l.includes('pnpm dlx skills add gkurt/deictic'))).toBe(true);

  // Again: nothing more to add.
  lines.length = 0;
  await init({ cwd: app.root, log: (l) => lines.push(l), run: () => true, install: false, skill: false });
  expect(lines).toContain('deictic: vite.config.ts has it already');
});

test('init with --dry-run changes nothing, and a failed install stops it', async () => {
  const config = `export default { plugins: [] };\n`;
  const app = project({ 'package.json': manifest({ vite: '8' }), 'bun.lock': '', 'vite.config.ts': config });
  const ran: string[] = [];
  const lines: string[] = [];
  await init({ cwd: app.root, dryRun: true, skill: true, log: (l) => lines.push(l), run: (c) => ran.push(c) > 0 });
  expect(ran).toEqual([]);
  expect(app.read('vite.config.ts')).toBe(config);
  expect(lines).toContain('deictic: would add it to vite.config.ts');
  expect(init({ cwd: app.root, log: () => {}, run: () => false })).rejects.toThrow(/the install failed: run bun add -d/);
});

test('init asks before adding the skill, and runs it where the answer is yes', async () => {
  const app = project({ 'package.json': manifest({ vite: '8' }), 'package-lock.json': '{}', 'vite.config.ts': 'export default {};\n' });
  const ran: string[] = [];
  await init({ cwd: app.root, install: false, log: () => {}, run: (c) => ran.push(c) > 0, ask: async () => true });
  expect(ran).toEqual(['npx skills add gkurt/deictic']);
});
