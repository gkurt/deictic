import { expect, test } from 'bun:test';
import { join } from 'node:path';

import type { Problem } from '#src/index.ts';
import { loadCatalog } from '#src/plugins/tailwind/catalog.ts';
import { tailwind } from '#src/plugins/tailwind/index.ts';

import { project } from './fixture.ts';

// The site is a real Tailwind v4 project, with a theme of its own (`--color-signal`).
const site = join(import.meta.dir, '..', 'site');
const catalog = await loadCatalog(site, 'src/site.css');
const names = (items: { name: string }[]) => items.map((item) => item.name);

test('completes a word: the class itself, those starting with it, then those holding it', () => {
  expect(names(catalog.complete('flex')).slice(0, 2)).toEqual(['flex', 'flex-1']);
  expect(names(catalog.complete('p-')).slice(0, 4)).toEqual(['p-0', 'p-0.5', 'p-1', 'p-1.5']);
  expect(names(catalog.complete('signal'))).toContain('bg-signal');
  expect(catalog.complete('')).toEqual([]);
});

test('completes under variants and `!`, and offers variants', () => {
  expect(names(catalog.complete('md:hover:fle'))[0]).toBe('md:hover:flex');
  expect(names(catalog.complete('!fle'))[0]).toBe('!flex');
  expect(catalog.complete('hov')).toContainEqual({ name: 'hover:', known: true, variant: true });
  expect(names(catalog.complete('dark:hov'))).toContain('dark:hover:');
});

test("completes a class's modifiers after its slash", () => {
  expect(names(catalog.complete('bg-red-500/5'))).toEqual(['bg-red-500/5', 'bg-red-500/50', 'bg-red-500/55']);
});

test('says what a class sets, with the theme resolved', () => {
  expect(catalog.info(['text-sm', 'p-4', 'bg-signal', 'text-red-500', 'w-1/2', 'my-own'])).toEqual([
    { name: 'text-sm', known: true, value: '0.875rem' },
    { name: 'p-4', known: true, value: '1rem' },
    { name: 'bg-signal', known: true, color: '#12b358', value: '#12b358' },
    { name: 'text-red-500', known: true, color: 'oklch(63.7% 0.237 25.331)', value: 'oklch(63.7% 0.237 25.331)' },
    { name: 'w-1/2', known: true, value: '50%' },
    { name: 'my-own', known: false },
  ]);
  expect(catalog.info(['md:hover:bg-[#ff0000]!', 'text-[13px]'])).toEqual([
    { name: 'md:hover:bg-[#ff0000]!', known: true, color: '#ff0000', value: '#ff0000' },
    { name: 'text-[13px]', known: true, value: '13px' },
  ]);
});

test('lists the classes of a kind, in order of size, written as the class was', () => {
  const sizes = catalog.alternatives('md:text-sm')!;
  expect(sizes).toMatchObject({ label: 'font-size', colors: false, custom: { before: 'md:text-[', after: ']' } });
  expect(names(sizes.items).slice(0, 4)).toEqual(['md:text-xs', 'md:text-sm', 'md:text-base', 'md:text-lg']);
  expect(names(sizes.items)).not.toContain('md:text-red-500');

  const display = names(catalog.alternatives('flex')!.items);
  expect(display).toContain('grid');
  expect(display).toContain('hidden');
  expect(catalog.alternatives('flex')!.custom).toBeUndefined();
  expect(catalog.alternatives('my-own')).toBeUndefined();
});

test('a colour keeps its modifier across its kind, and a custom value finds its kind', () => {
  const colors = catalog.alternatives('bg-red-500/50')!;
  expect(colors).toMatchObject({ label: 'background-color', colors: true, custom: { before: 'bg-[', after: ']/50' } });
  expect(names(colors.items)).toContain('bg-signal/50');

  const custom = catalog.alternatives('text-[13px]')!;
  expect(custom.custom).toEqual({ before: 'text-[', after: ']', value: '13px' });
  expect(names(custom.items).slice(0, 3)).toEqual(['text-[13px]', 'text-xs', 'text-sm']);
});

test('writes CSS a page can use before its build knows the classes', () => {
  const css = catalog.css(['md:p-4', 'text-red-500', 'font-bold', 'my-own']);
  expect(css).toContain('@layer utilities {');
  expect(css).toContain('padding: calc(0.25rem * 4);');
  expect(css).toContain('color: oklch(63.7% 0.237 25.331);');
  // `@property` can't be in a layer.
  expect(css.indexOf('@property --tw-font-weight')).toBeLessThan(css.indexOf('@layer'));
  expect(css.slice(css.indexOf('@layer'))).not.toContain('@property');
  expect(catalog.css(['my-own'])).toBe('');
});

test('a project without Tailwind answers nothing, and reports it once', async () => {
  const p = project({ 'package.json': '{}' });
  const said: Problem[] = [];
  const { routes } = tailwind();
  const context = { root: p.root, use: () => undefined, report: (problem: Problem) => said.push(problem), onClose: () => {} };
  const info = await routes!.info!(
    new Request('http://localhost/', { method: 'POST', body: JSON.stringify({ classes: ['flex'] }) }),
    context,
  );
  expect(await info.json()).toEqual({ available: false, items: [] });
  const complete = await routes!.complete!(new Request('http://localhost/?q=fle'), context);
  expect(await complete.json()).toEqual({ items: [] });
  expect(said).toHaveLength(1);
  expect(said[0]).toMatchObject({ key: 'setup:tailwind', kind: 'setup', plugin: 'tailwind' });
  expect(said[0]!.message).toContain('no Tailwind v4');
});
