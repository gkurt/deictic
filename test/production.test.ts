/**
 * Real production builds, with deictic and a plugin with a page half configured as an app would: not a trace of
 * either may reach the output. Each scan is first shown to find deictic where it does run, so a clean result
 * means it stayed out, not that the scan missed it.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { rspack } from '@rspack/core';
import { build } from 'vite';

import { deictic as bun } from '#src/bun.ts';
import { definePlugin } from '#src/index.ts';
import { deictic as vite } from '#src/vite.ts';
import { DeicticPlugin } from '#src/webpack.ts';

import { project } from './fixture.ts';

// A JSX factory of its own, so the fixture needs no React installed.
const APP = [
  'const h = (tag, props, ...children) => ({ tag, props, children });',
  'export const App = () => <main className="p-4"><p>Hi</p></main>;',
  'console.log(App());',
  '',
].join('\n');
const HTML =
  '<!doctype html><html><head><title>App</title></head><body><script type="module" src="/src/main.jsx"></script></body></html>\n';
const pin = definePlugin({ name: 'pin', client: 'pin/client' });

/** Every file a build wrote, and what's in it. */
function output(dir: string): { file: string; text: string }[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({ file: join(entry.parentPath, entry.name), text: readFileSync(join(entry.parentPath, entry.name), 'utf8') }));
}

// The fixtures live in this repository, whose folder is named deictic too, and a build may keep a file's path
// (JSX source info under NODE_ENV=test): that's the project's name, not deictic's code.
const REPO = join(import.meta.dir, '..');
const PATHS = [REPO, REPO.replaceAll('\\', '/'), REPO.replaceAll('\\', '\\\\')];

/** The files that mention deictic: its marks, endpoints, client and overlay all carry its name. */
function traces(dir: string): string[] {
  return output(dir)
    .filter(({ text }) => /deictic/i.test(PATHS.reduce((rest, path) => rest.replaceAll(path, ''), text)))
    .map(({ file }) => file);
}

describe('a production build has nothing of deictic', () => {
  test('Vite', async () => {
    const run = async (outDir: string, plugin: ReturnType<typeof vite>) => {
      const p = project({ 'index.html': HTML, 'src/main.jsx': APP });
      await build({
        root: p.root,
        configFile: false,
        logLevel: 'silent',
        oxc: { jsx: { runtime: 'classic', pragma: 'h' } },
        plugins: [plugin],
        build: { outDir, rolldownOptions: { external: [/^pin\//] } },
      });
      return traces(join(p.root, outDir));
    };
    // Forced into the build, it marks the element and starts the overlay: the scan finds it.
    expect(await run('forced', { ...vite({ plugins: [pin] }), apply: 'build' })).not.toEqual([]);
    expect(await run('dist', vite({ plugins: [pin] }))).toEqual([]);
  }, 60_000);

  test('webpack and Rspack', async () => {
    const run = async (mode: 'development' | 'production') => {
      const p = project({ 'src/main.jsx': APP });
      const compiler = rspack({
        mode,
        context: p.root,
        entry: './src/main.jsx',
        output: { path: join(p.root, 'dist') },
        devtool: false,
        module: {
          rules: [
            {
              test: /\.jsx$/,
              loader: 'builtin:swc-loader',
              options: { jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { pragma: 'h' } } } },
            },
          ],
        },
        // deictic's page half and the plugin's are the app's dependencies, not installed in the fixture.
        externals: [/^deictic(\/|$)/, /^pin\//],
        plugins: [new DeicticPlugin({ plugins: [pin] })],
      });
      const error = await new Promise<string | undefined>((done) =>
        compiler.run((e, stats) => compiler.close(() => done(e?.message ?? (stats?.hasErrors() ? stats.toString() : undefined)))),
      );
      expect(error).toBeUndefined();
      return traces(join(p.root, 'dist'));
    };
    expect(await run('development')).not.toEqual([]);
    expect(await run('production')).toEqual([]);
  }, 60_000);

  test('Bun', async () => {
    const p = project({ 'src/main.jsx': APP });
    const result = await Bun.build({
      entrypoints: [join(p.root, 'src/main.jsx')],
      outdir: join(p.root, 'dist'),
      jsx: { runtime: 'classic', factory: 'h' },
      plugins: [bun({ root: p.root, plugins: [pin] })],
    });
    expect(result.success).toBe(true);
    expect(traces(join(p.root, 'dist'))).toEqual([]);
  });
});
