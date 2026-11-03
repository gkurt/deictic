import { expect, test } from 'bun:test';

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

test('opens a place in the editor, and answers nothing for other paths', async () => {
  const { p, handle } = setup();
  const res = await handle(new Request(`${ORIGIN}/__deictic/open?file=src/App.tsx&line=1&column=26`));
  expect(res!.headers.get('location')).toContain(p.root);
  expect(await handle(new Request(`${ORIGIN}/src/App.tsx`))).toBeUndefined();
});
