import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { definePlugin } from '#src/index.ts';
import { History } from '#src/tools/history.ts';
import { keptIn } from '#src/tools/kept.ts';

import { project } from './fixture.ts';

test('undoes and redoes a change across files, and drops redo on a new change', async () => {
  const p = project({ 'a.tsx': 'a1', 'b.tsx': 'b1' });
  const history = new History(p.root);
  history.commit(
    'first',
    new Map([
      ['a.tsx', 'a2'],
      ['b.tsx', 'b2'],
    ]),
  );
  expect([p.read('a.tsx'), p.read('b.tsx')]).toEqual(['a2', 'b2']);

  expect((await history.undo()).label).toBe('first');
  expect([p.read('a.tsx'), p.read('b.tsx')]).toEqual(['a1', 'b1']);
  expect((await history.redo()).label).toBe('first');
  expect(p.read('a.tsx')).toBe('a2');

  await history.undo();
  history.commit('second', new Map([['a.tsx', 'a3']]));
  expect(await refusal(history.redo())).toBe('nothing to redo');
  expect(history.list().done.map((c) => [c.id, c.label])).toEqual([[2, 'second']]);
});

test('refuses to undo over an edit made since, touching no file', async () => {
  const p = project({ 'a.tsx': 'a1', 'b.tsx': 'b1' });
  const history = new History(p.root);
  history.commit(
    'both',
    new Map([
      ['a.tsx', 'a2'],
      ['b.tsx', 'b2'],
    ]),
  );
  p.write('b.tsx', 'b2 edited');
  expect(await refusal(history.undo())).toMatch(/b\.tsx changed since "both" was made/);
  expect(p.read('a.tsx')).toBe('a2');
});

test('removes a file the change made, and outlives a restart', async () => {
  const p = project({ 'a.tsx': 'a1' });
  new History(p.root).commit('new file', new Map([['en.json', '{}']]));
  const again = new History(p.root);
  expect(again.list().done.map((c) => c.files)).toEqual([['en.json']]);
  await again.undo();
  expect(existsSync(join(p.root, 'en.json'))).toBe(false);
});

test('refuses a change that changes nothing, and files outside the project', () => {
  const p = project({ 'a.tsx': 'a1' });
  const history = new History(p.root);
  expect(() => history.commit('same', new Map([['a.tsx', 'a1']]))).toThrow('nothing to change');
  expect(() => history.commit('out', new Map([['../x.tsx', '']]))).toThrow("not a file of this project's own");
  expect(() => history.commit('dep', new Map([['node_modules/x/a.js', '']]))).toThrow("not a file of this project's own");
});

/** What a change that should be refused was refused with. */
const refusal = (change: Promise<unknown>) =>
  change.then(
    () => 'not refused',
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  );

test("hands a plugin's own change back to its undo and redo, after a restart too", async () => {
  const p = project({});
  const calls: string[] = [];
  const plugin = definePlugin<null, null, { id: number }>({
    name: 'ping',
    client: '',
    shortcut: { modifiers: ['Meta'] },
    read: () => null,
    apply: () => ({ done: { id: 1 } }),
    undo: ({ id }) => void calls.push(`undo ${id}`),
    redo: ({ id }) => (calls.push(`redo ${id}`), { id: id + 1 }),
  });
  new History(p.root, { plugins: [plugin] }).record('ping', 'ping', { id: 1 });

  const again = new History(p.root, { plugins: [plugin] });
  expect(again.list().done).toMatchObject([{ label: 'ping', files: [] }]);
  await again.undo();
  await again.redo();
  await again.undo();
  expect(calls).toEqual(['undo 1', 'redo 1', 'undo 2']);

  await again.redo();
  expect(await refusal(new History(p.root).undo())).toBe(
    `can't undo "ping": the ping plugin that made it isn't loaded, so add it back to \`plugins\``,
  );
});

test("keeps what deictic makes in the project's .deictic, which ignores itself in git", () => {
  const p = project({ 'src/App.tsx': 'export const App = () => <h1 />;\n' });
  expect(keptIn(p.root, 'history.json')).toBe(join(p.root, '.deictic', 'history.json'));
  expect(p.read('.deictic/.gitignore')).toEndWith('\n*\n');
  // Left as it is after: a project's own lines in it stay.
  p.write('.deictic/.gitignore', '*\n!keep\n');
  keptIn(p.root, 'screenshots');
  expect(p.read('.deictic/.gitignore')).toBe('*\n!keep\n');
});
