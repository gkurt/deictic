import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { definePlugin } from '#src/index.ts';
import { tailwind } from '#src/plugins/tailwind/index.ts';
import { endpoints, redirect } from '#src/tools/endpoints.ts';

import { project } from './fixture.ts';

const ORIGIN = 'http://localhost:5173';

function setup() {
  const p = project({ 'src/App.tsx': 'export const App = () => <div className="p-2">x</div>;\n' });
  const handle = endpoints({ root: p.root, plugins: [tailwind()], open: (path, loc) => redirect(`/__open?${path}:${loc.line}`) });
  const post = (route: string, body: unknown, headers: Record<string, string> = { origin: ORIGIN }) =>
    handle(
      new Request(`${ORIGIN}/__deictic/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }),
    );
  return { p, handle, post, target: p.target('src/App.tsx', 'div') };
}

test('reads, applies, undoes and redoes through the plugin', async () => {
  const { p, post, target } = setup();
  expect(await (await post('read', { plugin: 'tailwind', target }))!.json()).toEqual({ model: { editable: true, classes: 'p-2' } });

  const applied = (await (await post('apply', { plugin: 'tailwind', target, op: { classes: 'p-4' } }))!.json()) as {
    model: unknown;
    change: { label: string };
  };
  expect(applied.model).toEqual({ editable: true, classes: 'p-4' });
  expect(applied.change.label).toBe('tailwind src/App.tsx:1: +p-4 -p-2');
  expect(p.read('src/App.tsx')).toContain('className="p-4"');

  await post('undo', {});
  expect(p.read('src/App.tsx')).toContain('className="p-2"');
  await post('redo', {});
  expect(p.read('src/App.tsx')).toContain('className="p-4"');
});

test("undo, redo and history are a plugin's on an element, where the request names them", async () => {
  const { p, handle, post, target } = setup();
  await post('apply', { plugin: 'tailwind', target, op: { classes: 'p-4' } });
  const { file, line, column } = target.loc;
  const listed = async (query: Record<string, string>) => {
    const res = (await handle(new Request(`http://localhost:5173/__deictic/history?${new URLSearchParams(query)}`)))!;
    return ((await res.json()) as { done: { label: string }[] }).done.map((c) => c.label);
  };
  const here = { plugin: 'tailwind', file, line: String(line), column: String(column) };
  expect(await listed(here)).toEqual(['tailwind src/App.tsx:1: +p-4 -p-2']);
  expect(await listed({ ...here, plugin: 'tasks' })).toEqual([]);
  expect(await listed({ ...here, column: '99' })).toEqual([]);
  expect(await listed({})).toHaveLength(1);

  const elsewhere = { plugin: 'tailwind', target: { ...target, loc: { ...target.loc, column: 99 } } };
  expect(await (await post('undo', elsewhere))!.json()).toEqual({ problem: 'nothing to undo here' });
  expect(p.read('src/App.tsx')).toContain('className="p-4"');
  await post('undo', { plugin: 'tailwind', target });
  expect(p.read('src/App.tsx')).toContain('className="p-2"');
  expect(await (await post('redo', elsewhere))!.json()).toEqual({ problem: 'nothing to redo here' });
  await post('redo', { plugin: 'tailwind', target });
  expect(p.read('src/App.tsx')).toContain('className="p-4"');
});

test('takes edits only from the page itself, as JSON', async () => {
  const { post, target } = setup();
  const body = { plugin: 'tailwind', target, op: { classes: 'p-4' } };
  expect((await post('apply', body, { origin: 'https://evil.example' }))!.status).toBe(403);
  expect((await post('apply', body, {}))!.status).toBe(403);
  expect((await post('apply', body, { origin: ORIGIN, 'content-type': 'text/plain' }))!.status).toBe(403);
});

test('says why, for a stale target or an unknown plugin', async () => {
  const { p, post, target } = setup();
  p.write('src/App.tsx', '\n' + p.read('src/App.tsx'));
  const stale = await post('read', { plugin: 'tailwind', target });
  expect(stale!.status).toBe(422);
  expect(((await stale!.json()) as { problem: string }).problem).toMatch(/reload it/);
  expect(((await (await post('read', { plugin: 'nope', target }))!.json()) as { problem: string }).problem).toMatch(/no plugin "nope"/);
});

test("finds the element by its line where the page counts columns in other code, and says what the file has where it can't", async () => {
  const { p, post, target } = setup();
  // A plugin before deictic's that lengthened the line moves the page's column, not the element.
  const off = { ...target, loc: { ...target.loc, column: target.loc.column + 52 } };
  expect(await (await post('read', { plugin: 'tailwind', target: off }))!.json()).toEqual({ model: { editable: true, classes: 'p-2' } });

  const problem = async (body: unknown) => ((await (await post('read', body))!.json()) as { problem: string }).problem;
  p.write('src/App.tsx', 'export const App = () => <div className="p-2"><div>x</div></div>;\n');
  expect(await problem({ plugin: 'tailwind', target: off })).toStartWith('line 1 of src/App.tsx has 2 <div>s, none at column 78.');
  p.write('src/App.tsx', 'export const App = () => <p>x</p>;\n');
  expect(await problem({ plugin: 'tailwind', target })).toStartWith(
    'line 1 of src/App.tsx has no <div>: it reads `export const App = () => <p>x</p>;`.',
  );
  expect(await problem({ plugin: 'tailwind', target: { ...target, loc: { ...target.loc, line: 9 } } })).toStartWith(
    'src/App.tsx has no line 9.',
  );
});

test('opens a place in the editor, and answers nothing for other paths', async () => {
  const { p, handle } = setup();
  const res = await handle(new Request(`${ORIGIN}/__deictic/open?file=src/App.tsx&line=1&column=26`));
  expect(res!.headers.get('location')).toContain(p.root);
  expect(await handle(new Request(`${ORIGIN}/src/App.tsx`))).toBeUndefined();
});

test('makes a file an edit at its start names, and takes it away again on undo', async () => {
  const p = project({ 'src/App.tsx': 'export const App = () => <div>x</div>;\n' });
  const notes = definePlugin<null, string>({ name: 'notes', apply: (_, __, text) => [{ file: 'notes/de.yaml', start: 0, end: 0, text }] });
  const handle = endpoints({ root: p.root, plugins: [notes], open: () => new Response() });
  const post = (route: string, body: unknown) =>
    handle(
      new Request(`${ORIGIN}/__deictic/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify(body),
      }),
    );
  const target = p.target('src/App.tsx', 'div');
  expect((await post('apply', { plugin: 'notes', target, op: 'hallo: Hallo\n' }))!.status).toBe(200);
  expect(p.read('notes/de.yaml')).toBe('hallo: Hallo\n');
  await post('undo', {});
  expect(existsSync(join(p.root, 'notes/de.yaml'))).toBe(false);
});

test("runs what the plugins' setups left for the close, the last set up first, once", async () => {
  const p = project({ 'src/App.tsx': 'export const App = () => <div>x</div>;\n' });
  const ran: string[] = [];
  const closing = (name: string) => definePlugin({ name, setup: ({ onClose }) => onClose(() => void ran.push(name)) });
  const handle = endpoints({ root: p.root, plugins: [closing('first'), closing('second')], open: () => new Response() });
  await Promise.all([handle.close(), handle.close()]);
  expect(ran).toEqual(['second', 'first']);
});
