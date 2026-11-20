/**
 * A real `next dev`, on Turbopack and on webpack, with `reactCompiler: true`: Next compiles client components with the React
 * Compiler, and deictic's loader must still see their JSX as written. Next loads the config itself, so this runs
 * deictic as an app gets it, by its package name: from `dist`, which `bun run build` makes (CI builds first).
 */
import { expect, test } from 'bun:test';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { project } from './fixture.ts';

const REPO = join(import.meta.dir, '..');
const NEXT = join(REPO, 'node_modules/next/dist/bin/next');
const built = existsSync(join(REPO, 'dist/next.js'));

const files = {
  'next.config.mjs':
    "import { withDeictic } from 'deictic/next';\nexport default withDeictic({ reactCompiler: true, agentRules: false });\n",
  'app/layout.jsx': 'export default function Layout({ children }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n',
  // A server component in a plain `.js` file, as many apps write theirs.
  'app/page.js': "import { Counter } from './counter.jsx';\nexport default function Page() {\n  return <main><Counter /></main>;\n}\n",
  'app/counter.jsx': [
    "'use client';",
    "import { useState } from 'react';",
    'export function Counter() {',
    '  const [n, setN] = useState(0);',
    '  return <button type="button" onClick={() => setN(n + 1)}>{n}</button>;',
    '}',
    '',
  ].join('\n'),
};

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as { port: number };
  await new Promise((done) => server.close(done));
  return port;
}

/** Next starts workers of its own: take the whole tree down. */
function stop(child: ChildProcess) {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else process.kill(-child.pid, 'SIGKILL');
}

test.skipIf(!built).each(['turbopack', 'webpack'] as const)(
  'next dev --%s with reactCompiler: marks JSX before the compiler compiles it, on the server and in the browser',
  async (bundler) => {
    const p = project(files);
    // As an app has it installed: Turbopack doesn't resolve a package's imports of itself by name. Its manifest
    // and `dist`, not a link to the repository, which holds this fixture: that would be a loop.
    const installed = join(p.root, 'node_modules/deictic');
    mkdirSync(installed, { recursive: true });
    copyFileSync(join(REPO, 'package.json'), join(installed, 'package.json'));
    symlinkSync(join(REPO, 'dist'), join(installed, 'dist'), 'junction');
    const port = await freePort();
    const child = spawn(process.execPath, [NEXT, 'dev', `--${bundler}`, '--port', String(port)], {
      cwd: p.root,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      let log = '';
      await new Promise<void>((ready, fail) => {
        const read = (chunk: Buffer) => {
          log += chunk.toString();
          if (log.includes('Ready in')) ready();
        };
        child.stdout?.on('data', read);
        child.stderr?.on('data', read);
        child.once('exit', () => fail(new Error(`next dev exited:\n${log}`)));
      });
      const url = `http://127.0.0.1:${port}`;
      const html = await (await fetch(url)).text();
      // Server components, and the client one as the server renders it.
      expect(html).toContain('data-deictic="app/page.js:3:10"');
      expect(html).toContain('data-deictic="app/counter.jsx:5:10"');

      // The counter's module in the browser's chunks: compiled, marked, and starting the overlay.
      const chunks = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+)"/g)].map((m) => m[1]!);
      const texts = await Promise.all(chunks.map(async (chunk) => (await fetch(url + chunk)).text()));
      if (bundler === 'webpack') {
        // Its dev chunks hold each module as a string to `eval`: the mark and the client's import are in one of them.
        const chunk = texts.find((text) => text.includes('app/counter.jsx:5:10'));
        expect(chunk).toBeDefined();
        expect(chunk).toContain('.deictic/client.js');
        expect(chunk).toContain('compiler-runtime');
        return;
      }
      const start = /"\[project\]\/[^"]*app\/counter\.jsx \[app-client\] \(ecmascript\)"/;
      const chunk = texts.find((text) => start.test(text));
      expect(chunk).toBeDefined();
      // From its key to the next module's: each opens with `((__turbopack_context__) =>`.
      const MODULE = '((__turbopack_context__) =>';
      const from = chunk!.indexOf(MODULE, chunk!.search(start));
      const next = chunk!.indexOf(MODULE, from + MODULE.length);
      const counter = chunk!.slice(from, next === -1 ? undefined : next);
      expect(counter).toContain('"data-deictic": "app/counter.jsx:5:10"');
      expect(counter).toContain('.deictic/client.js');
      // The compiler's memo cache: `const $ = c(n)`, from react's compiler-runtime.
      expect(counter).toMatch(/const \$ = \(0, \S*compiler\S*runtime\S*\["c"\]\)\(\d+\)/);
    } finally {
      stop(child);
    }
  },
  120_000,
);
