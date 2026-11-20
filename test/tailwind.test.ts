import { expect, test } from 'bun:test';

import { Refusal, type TextEdit } from '#src/index.ts';
import { type Model, tailwind } from '#src/plugins/tailwind/index.ts';
import { applyEdits, sourceAt } from '#src/tools/source.ts';

import { project } from './fixture.ts';

const plugin = tailwind();
// Tailwind's half has both: the plugin type leaves them optional for plugins without a panel.
const { read, apply } = plugin as Required<typeof plugin>;

/** The file after applying `classes` to the first `<tag>` in `code`, and the model read before. */
function edit(code: string, classes: string, tag = 'div') {
  const p = project({ 'App.tsx': code });
  const target = p.target('App.tsx', tag);
  const source = sourceAt(p.root, target);
  const model = read(source, target);
  const edits = apply(source, target, { classes });
  if (!Array.isArray(edits)) throw new Error('tailwind answers text edits');
  return { model, after: applyEdits(source, edits).get('App.tsx') };
}

test('edits a string attribute, keeping its quotes', () => {
  expect(edit(`const a = <div className="p-2 text-sm">x</div>;`, 'p-4  text-sm ring')).toEqual({
    model: { editable: true, classes: 'p-2 text-sm' },
    after: `const a = <div className="p-4 text-sm ring">x</div>;`,
  });
  expect(edit(`const a = <div className='p-2'/>;`, 'p-4').after).toBe(`const a = <div className='p-4'/>;`);
});

test('edits a string or a plain template in braces', () => {
  expect(edit(`const a = <div className={'p-2'}/>;`, 'p-4').after).toBe(`const a = <div className={'p-4'}/>;`);
  expect(edit('const a = <div className={`p-2`}/>;', 'p-4').after).toBe('const a = <div className={`p-4`}/>;');
});

test("edits a helper's first argument and shows the rest", () => {
  const { model, after } = edit(`const a = <div className={cn('p-2', on && 'ring', x)}/>;`, 'p-4');
  expect(model).toEqual({
    editable: true,
    classes: 'p-2',
    others: [{ source: "'ring'", classes: 'ring', when: 'on', editable: true }, { source: 'x' }],
  });
  expect(after).toBe(`const a = <div className={cn('p-4', on && 'ring', x)}/>;`);
});

test("reads a helper's other arguments as classes and what they wait on", () => {
  const code = [
    `const OUTLINED = 'outline-2 bg-signal/10';`,
    'export const BASE = `flex`;',
    `const a = <div className={cn('p-2', active === 'h3' && OUTLINED, on ? 'ring' : 'shadow', off ? 'hidden' : undefined, { italic: slanted, 'font-bold': true, [key]: 1 }, BASE, ...more, pick(x))}/>;`,
  ].join('\n');
  expect(edit(code, 'p-2').model).toEqual({
    editable: true,
    classes: 'p-2',
    others: [
      { source: 'OUTLINED', classes: 'outline-2 bg-signal/10', when: "active === 'h3'", editable: true, shared: 'OUTLINED' },
      { source: "'ring'", classes: 'ring', when: 'on', editable: true },
      { source: "'shadow'", classes: 'shadow', when: '!on', editable: true },
      { source: "'hidden'", classes: 'hidden', when: 'off', editable: true },
      { source: 'italic: slanted', classes: 'italic', when: 'slanted' },
      { source: "'font-bold': true", classes: 'font-bold', editable: true },
      { source: '[key]: 1' },
      { source: 'BASE', classes: 'flex', editable: true, shared: 'BASE' },
      { source: '...more' },
      { source: 'pick(x)' },
    ],
  });
});

test("edits the classes one of a helper's other arguments adds, where they're a string in the file", () => {
  const code = [
    `const OUTLINED = 'outline-2';`,
    `const a = <div className={cn('p-2', on ? "ring" : 'shadow', active && OUTLINED, x)}/>;`,
  ].join('\n');
  const p = project({ 'App.tsx': code });
  const target = p.target('App.tsx', 'div');
  const source = sourceAt(p.root, target);
  const write = (classes: string, at: number) => applyEdits(source, apply(source, target, { classes, at }) as TextEdit[]).get('App.tsx');
  expect(write('ring-2  ring-red-500', 0)).toBe(code.replace('"ring"', '"ring-2 ring-red-500"'));
  expect(write('', 1)).toBe(code.replace("'shadow'", "''"));
  expect(write('outline-4', 2)).toBe(code.replace("'outline-2'", "'outline-4'"));
  expect(() => write('p-4', 3)).toThrow(Refusal);
  expect(() => write('p-4', 9)).toThrow(Refusal);
  expect(plugin.describe!({ classes: 'ring-2', at: 0 }, read(source, target) as Model)).toBe('+ring-2 -ring when on');
});

test('adds the attribute to an element without one', () => {
  expect(edit(`const a = <div id="x"/>;`, 'flex gap-2')).toEqual({
    model: { editable: true, classes: '' },
    after: `const a = <div className="flex gap-2" id="x"/>;`,
  });
});

test('shows a list built at runtime and refuses to edit it', () => {
  expect(() => edit('const a = <div className={styles.box}/>;', 'p-4')).toThrow(Refusal);
  const p = project({ 'App.tsx': 'const a = <div className={`p-${n}`}/>;' });
  const target = p.target('App.tsx', 'div');
  expect(read(sourceAt(p.root, target), target)).toEqual({ editable: false, source: 'className={`p-${n}`}' });
});

test("refuses a class holding the attribute's own quote", () => {
  expect(() => edit(`const a = <div className="p-2"/>;`, `content-["x"]`)).toThrow(/use the other quote/);
  expect(edit(`const a = <div className="p-2"/>;`, `content-['x']`).after).toBe(`const a = <div className="content-['x']"/>;`);
});

test('says what changed', () => {
  expect(plugin.describe!({ classes: 'p-4 ring' }, { editable: true, classes: 'p-2 ring' })).toBe('+p-4 -p-2');
});
