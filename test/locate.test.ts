import { expect, test } from 'bun:test';

import { locate } from '#src/tools/locate.ts';

test('marks host elements with where their tag starts, and leaves components alone', () => {
  const code = [
    'export function App() {',
    '  return (',
    '    <main>',
    '      <Card title="x" />',
    '      <h1 className="a">Hi</h1>',
    '    </main>',
    '  );',
    '}',
  ].join('\n');
  expect(locate(code, 'src/App.tsx')?.code).toBe(
    [
      'export function App() {',
      '  return (',
      '    <main data-deictic="src/App.tsx:3:5">',
      '      <Card title="x" />',
      '      <h1 data-deictic="src/App.tsx:5:7" className="a">Hi</h1>',
      '    </main>',
      '  );',
      '}',
    ].join('\n'),
  );
});

test("maps back to the file, named from the module's own folder", () => {
  expect(locate('const a = <b />;', 'src/App.tsx')?.map.sources).toEqual(['App.tsx']);
});

test('appends after the code, and leaves a module with nothing to mark or that does not parse', () => {
  expect(locate('const a = <b />;', 'x.tsx', '\nimport "c";')?.code).toBe('const a = <b data-deictic="x.tsx:1:11" />;\nimport "c";');
  expect(locate('const a = <B />;', 'x.tsx')).toBeUndefined();
  expect(locate('const a = <b>;', 'x.tsx')).toBeUndefined();
});

test('keeps a mark the source already has, and skips member and namespaced tags', () => {
  expect(locate('<div data-deictic="kept" />', 'x.jsx')).toBeUndefined();
  expect(locate('<>{<motion.div />}{<svg:rect />}</>', 'x.jsx')).toBeUndefined();
});

test('counts columns in UTF-16, as the browser and the parser do', () => {
  expect(locate('const s = "😀"; const a = <i />;', 'x.tsx')?.code).toContain('x.tsx:1:27');
});
