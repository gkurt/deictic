/**
 * `.astro` components: marked with the project's own Astro's parser, read back by `sourceAt`, and, in a real
 * `astro dev`, in the HTML a page renders. Astro loads the config itself, so that one runs deictic as an app gets
 * it, by its package name: from `dist`, which `bun run build` makes (CI builds first).
 */
import { expect, test } from 'bun:test';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { Refusal, type TextEdit } from '#src/index.ts';
import { tailwind } from '#src/plugins/tailwind/index.ts';
import { locateAstro } from '#src/tools/astro.ts';
import { applyEdits, sourceAt } from '#src/tools/source.ts';

import { project } from './fixture.ts';

const REPO = join(import.meta.dir, '..');

const PAGE = [
  '---',
  "import Card from '../components/Card.astro';",
  "const name = 'Wörld 😀';",
  'const items = [1, 2];',
  '---',
  '<html lang="en">',
  '  <body>',
  '    <h1 class="text-xl">Héllo 😀 <em>{name}</em></h1>',
  '    <ul>{items.map((i) => <li>{i < 2 ? <b>one</b> : i}</li>)}</ul>',
  '    <Card><span slot="title">t</span></Card>',
  '    <slot />',
  '    <style>h1 { color: red }</style>',
  "    <script>document.title = '<i>x</i>';</script>",
  '  </body>',
  '</html>',
  '',
].join('\n');

test('marks host elements in the template, in expressions too, and leaves components and what Astro treats itself', () => {
  const p = project({ 'src/pages/index.astro': PAGE });
  const code = locateAstro(PAGE, 'src/pages/index.astro', p.root)?.code.split('\n');
  expect(code?.[5]).toBe('<html data-deictic="src/pages/index.astro:6:1" lang="en">');
  // After an emoji in the line, in UTF-16 columns.
  expect(code?.[7]).toBe(
    '    <h1 data-deictic="src/pages/index.astro:8:5" class="text-xl">Héllo 😀 <em data-deictic="src/pages/index.astro:8:34">{name}</em></h1>',
  );
  expect(code?.[8]).toContain(
    '<li data-deictic="src/pages/index.astro:9:27">{i < 2 ? <b data-deictic="src/pages/index.astro:9:40">one</b>',
  );
  expect(code?.[9]).toBe('    <Card><span data-deictic="src/pages/index.astro:10:11" slot="title">t</span></Card>');
  expect(code?.slice(10, 13)).toEqual(PAGE.split('\n').slice(10, 13));
});

test('leaves a file with nothing to mark, or that does not parse', () => {
  const p = project({});
  expect(locateAstro('---\nconst a = 1;\n---\n<Card />', 'a.astro', p.root)).toBeUndefined();
  expect(locateAstro('<p>{items.map(}</p>', 'a.astro', p.root)).toBeUndefined();
});

test("reads an element back where the page says it is, and edits its class list with Tailwind's panel", () => {
  const p = project({ 'src/pages/index.astro': PAGE });
  const plugin = tailwind();
  const h1 = p.target('src/pages/index.astro', 'h1');
  const source = sourceAt(p.root, h1);
  expect(plugin.read!(source, h1)).toEqual({ editable: true, classes: 'text-xl' });
  const edits = plugin.apply!(source, h1, { classes: 'text-2xl font-bold' }) as TextEdit[];
  expect(applyEdits(source, edits).get('src/pages/index.astro')).toBe(PAGE.replace('"text-xl"', '"text-2xl font-bold"'));

  // An element without one gets `class`, as an `.astro` file writes it.
  const em = p.target('src/pages/index.astro', 'em');
  const added = plugin.apply!(sourceAt(p.root, em), em, { classes: 'italic' }) as TextEdit[];
  expect(applyEdits(sourceAt(p.root, em), added).get('src/pages/index.astro')).toContain('<em class="italic">{name}</em>');

  p.write('src/pages/index.astro', `\n${PAGE}`);
  expect(() => sourceAt(p.root, h1)).toThrow(Refusal);
});

test("shows a `class:list` as it's written, and adds no `class` beside it", () => {
  const p = project({ 'a.astro': "<p class:list={['a', { b: on }]}>x</p>" });
  const target = p.target('a.astro', 'p');
  expect(tailwind().read!(sourceAt(p.root, target), target)).toEqual({ editable: false, source: "class:list={['a', { b: on }]}" });
});

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as { port: number };
  await new Promise((done) => server.close(done));
  return port;
}

/** Astro starts workers of its own: take the whole tree down. */
function stop(child: ChildProcess) {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else process.kill(-child.pid, 'SIGKILL');
}

test.skipIf(!existsSync(join(REPO, 'dist/astro.js')))(
  'astro dev: a page renders its marks, with the overlay and the endpoints',
  async () => {
    const p = project({
      'package.json': '{ "name": "site", "type": "module", "private": true }\n',
      'astro.config.mjs':
        "import { defineConfig } from 'astro/config';\nimport { deictic } from 'deictic/astro';\nexport default defineConfig({ integrations: [deictic()], devToolbar: { enabled: false } });\n",
      'src/components/Card.astro': '<section><slot name="title" /></section>\n',
      'src/pages/index.astro': PAGE,
    });
    // As an app has it installed: its manifest and `dist`, not a link to the repository, which holds this fixture.
    const installed = join(p.root, 'node_modules/deictic');
    mkdirSync(installed, { recursive: true });
    copyFileSync(join(REPO, 'package.json'), join(installed, 'package.json'));
    symlinkSync(join(REPO, 'dist'), join(installed, 'dist'), 'junction');
    const port = await freePort();
    const child = spawn(
      process.execPath,
      [join(REPO, 'node_modules/astro/bin/astro.mjs'), 'dev', '--port', String(port), '--host', '127.0.0.1'],
      {
        cwd: p.root,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
      },
    );
    try {
      let log = '';
      await new Promise<void>((ready, fail) => {
        const read = (chunk: Buffer) => {
          log += chunk.toString();
          if (log.includes(`:${port}`)) ready();
        };
        child.stdout?.on('data', read);
        child.stderr?.on('data', read);
        child.once('exit', () => fail(new Error(`astro dev exited:\n${log}`)));
      });
      const url = `http://127.0.0.1:${port}`;
      const html = await (await fetch(url)).text();
      expect(html).toContain('<h1 data-deictic="src/pages/index.astro:8:5"');
      expect(html).toContain('data-deictic="src/pages/index.astro:9:27"');
      expect(html).toContain('<section data-deictic="src/components/Card.astro:1:1"');
      // The page's own style and script still go through Astro: scoped, bundled, and not in the page as written.
      expect(html).not.toContain("document.title = '<i>x</i>'");
      // The overlay, injected into the page, and the endpoints on the dev server.
      expect(html).toMatch(/<script type="module" src="[^"]*astro[^"]*scripts[^"]*page[^"]*"/);
      expect((await fetch(`${url}/__deictic/history`)).status).toBe(200);
    } finally {
      stop(child);
    }
  },
  120_000,
);
