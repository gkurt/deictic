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

test("undoes and redoes within a scope: a plugin's changes on one element, whatever came after", async () => {
  const p = project({ 'a.tsx': 'a1', 'b.tsx': 'b1' });
  const history = new History(p.root);
  const [a, b] = [
    { plugin: 'tailwind', target: 'a.tsx:1:1' },
    { plugin: 'tailwind', target: 'b.tsx:1:1' },
  ];
  history.commit('on a', new Map([['a.tsx', 'a2']]), a);
  history.commit('on b', new Map([['b.tsx', 'b2']]), b);
  expect(history.list(a).done.map((c) => c.label)).toEqual(['on a']);

  // Not the latest change, which is b's.
  expect((await history.undo(a)).label).toBe('on a');
  expect([p.read('a.tsx'), p.read('b.tsx')]).toEqual(['a1', 'b2']);
  expect(await refusal(history.undo(a))).toBe('nothing to undo here');
  expect(await refusal(history.undo({ plugin: 'tasks', target: 'b.tsx:1:1' }))).toBe('nothing to undo here');

  // A new change drops its own scope's redo, and leaves another's.
  history.commit('on b again', new Map([['b.tsx', 'b3']]), b);
  expect(history.list(a).undone.map((c) => c.label)).toEqual(['on a']);
  expect((await history.redo(a)).label).toBe('on a');
  expect(p.read('a.tsx')).toBe('a2');

  // With no scope, the whole history's latest.
  expect((await history.undo()).label).toBe('on a');
  expect((await history.undo()).label).toBe('on b again');
});

test('takes a change back from under a later one to the same file, by its own lines', async () => {
  const text = (first: string, second: string) => `<div>\n  <h1 className="${first}">A</h1>\n  <p className="${second}">B</p>\n</div>\n`;
  const p = project({ 'a.tsx': text('p-2', 'm-2') });
  const history = new History(p.root);
  const [h1, para] = [
    { plugin: 'tailwind', target: 'a.tsx:2:3' },
    { plugin: 'tailwind', target: 'a.tsx:3:3' },
  ];
  history.commit('h1', new Map([['a.tsx', text('p-4', 'm-2')]]), h1);
  history.commit('p', new Map([['a.tsx', text('p-4', 'm-4')]]), para);

  await history.undo(h1);
  expect(p.read('a.tsx')).toBe(text('p-2', 'm-4'));
  await history.redo(h1);
  expect(p.read('a.tsx')).toBe(text('p-4', 'm-4'));

  // Its line edited since: not there as it wrote it, so it's the editor's to undo.
  p.write('a.tsx', text('p-4 font-bold', 'm-4'));
  expect(await refusal(history.undo(h1))).toMatch(/a\.tsx changed since "h1" was made/);
  // Nor where the line it wrote is there twice.
  p.write('a.tsx', `${text('p-4', 'm-4')}  <h1 className="p-4">A</h1>\n`);
  expect(await refusal(history.undo(h1))).toMatch(/a\.tsx changed since "h1" was made/);
  expect(p.read('a.tsx')).toEndWith('<h1 className="p-4">A</h1>\n');
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
