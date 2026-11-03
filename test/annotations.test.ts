import { expect, test } from 'bun:test';

import { type Annotation, annotations } from '#src/plugins/annotations/index.ts';
import { toSvg } from '#src/plugins/annotations/svg.ts';
import { tailwind } from '#src/plugins/tailwind/index.ts';
import { tasks } from '#src/plugins/tasks/index.ts';
import { checkPlugins } from '#src/tools/plugins.ts';
import { clientModule } from '#src/vite.ts';

const mark = (shape: Annotation['shape']): Annotation => ({ id: 'a', color: '#ef4444', shape, at: 0 });

test('draws each kind of mark, in page coordinates, viewed from where the page scrolled', () => {
  const svg = toSvg(
    [
      mark({ kind: 'box', x: 10, y: 1020, width: 100, height: 40 }),
      mark({ kind: 'arrow', from: { x: 0, y: 1000 }, to: { x: 100, y: 1000 } }),
      mark({
        kind: 'pen',
        points: [
          { x: 1, y: 1001 },
          { x: 2.25, y: 1002 },
        ],
      }),
      mark({ kind: 'note', at: { x: 50, y: 1100 }, text: 'Too <tight>\nhere' }),
    ],
    { x: 0, y: 0, width: 800, height: 600 },
    { x: 0, y: 1000 },
  );
  expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 1000 800 600">');
  expect(svg).toContain('<rect x="10" y="1020" width="100" height="40" rx="4" fill="none" stroke="#ef4444"');
  // The line, then the head: back from the tip either side of it.
  expect(svg).toContain('<path d="M0,1000 L100,1000 M87.4,993.9 L100,1000 L87.4,1006.1"');
  expect(svg).toContain('<polyline points="1,1001 2.3,1002"');
  expect(svg).toContain('Too &lt;tight&gt;</tspan>');
  expect(svg).toContain('>here</tspan>');
});

test('draws an area of the viewport as its own SVG: an element’s part, or the whole', () => {
  const svg = toSvg([mark({ kind: 'box', x: 0, y: 0, width: 1, height: 1 })], { x: 24, y: 300, width: 200, height: 40 }, { x: 0, y: 100 });
  expect(svg).toContain('width="200" height="40" viewBox="24 400 200 40"');
});

test('is a tab beside Tailwind’s and tasks’, with its colour for the page', () => {
  expect(() => checkPlugins([tailwind(), tasks(), annotations()])).not.toThrow();
  expect(clientModule([annotations({ color: '#0ea5e9' })], '/')).toContain(`{ plugin: p0, ...{"options":{"color":"#0ea5e9"}} }`);
});
