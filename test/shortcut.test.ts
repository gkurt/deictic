import { expect, test } from 'bun:test';

import { tailwind } from '#src/plugins/tailwind/index.ts';
import { tasks } from '#src/plugins/tasks/index.ts';
import { checkShortcut, checkShortcuts, gestureOf } from '#src/shortcut.ts';
import { prepare } from '#src/tools/integration.ts';
import { checkPlugins } from '#src/tools/plugins.ts';
import { clientModule } from '#src/vite.ts';

test('plugins have no shortcut of their own unless given one: deictic’s opens them all', () => {
  expect(checkShortcuts([tailwind(), tasks()])).toEqual([undefined, undefined]);
  expect(checkShortcuts([tailwind({ shortcut: { modifiers: ['Shift', 'Control'], button: 'right' } })])).toEqual([
    { modifiers: ['Control', 'Shift'], button: 'right' },
  ]);
});

test('says what to write instead of a shortcut that would never work', () => {
  expect(() => checkShortcut('tasks', { modifiers: [] })).toThrow("deictic: tasks's shortcut.modifiers is empty");
  expect(() => checkShortcut('tasks', { modifiers: ['Ctrl' as 'Control'] })).toThrow("shortcut.modifiers has 'Ctrl': name one of 'Alt'");
  expect(() => checkShortcut('tasks', { modifiers: ['Alt'], button: 'back' as 'left' })).toThrow("shortcut.button is 'back'");
  const alt = { modifiers: ['Alt' as const] };
  expect(() => checkShortcuts([tailwind({ shortcut: alt }), tasks({ shortcut: alt })])).toThrow(
    'deictic: tasks and tailwind both open on Alt: give one of them another `shortcut`',
  );
  // deictic's own, Alt by default, is one of them; `false` turns it off.
  expect(() => checkPlugins([tailwind({ shortcut: alt })])).toThrow('deictic: tailwind and deictic both open on Alt');
  expect(() => checkPlugins([tailwind({ shortcut: alt })], false)).not.toThrow();
  // The same keys with another button are another shortcut.
  expect(() => checkPlugins([tailwind({ shortcut: { modifiers: ['Alt'], button: 'right' } })])).not.toThrow();
});

test('holds exactly its keys: AltGr, which is Control and Alt, is not Alt', () => {
  const { held, button } = gestureOf({ modifiers: ['Alt'], button: 'middle' });
  const keys = (on: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>>) =>
    ({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...on }) as MouseEvent;
  expect(held(keys({ altKey: true }))).toBe(true);
  expect(held(keys({ altKey: true, ctrlKey: true }))).toBe(false);
  expect(button).toBe(1);
});

test('starts the overlay with deictic’s own shortcut, and each panel with its own', () => {
  expect(clientModule([tasks({ shortcut: { modifiers: ['Meta'] } })], '/')).toContain(
    `start({ base: "/", shortcut: {"modifiers":["Alt"],"button":"left"}, plugins: [{ plugin: p0, ...{"shortcut":{"modifiers":["Meta"],"button":"left"}} }] });`,
  );
  expect(clientModule([tasks()], '/', { modifiers: ['Control'], button: 'right' })).toContain(
    `start({ base: "/", shortcut: {"modifiers":["Control"],"button":"right"}, plugins: [{ plugin: p0, ...{} }] });`,
  );
  expect(clientModule([tasks()], '/', false)).toContain(`start({ base: "/", shortcut: undefined, plugins: [{ plugin: p0, ...{} }] });`);
});

test('starts the overlay in the view the options name, and refuses one that is none', () => {
  expect(clientModule([tasks()], '/', undefined, undefined, 'spotlight')).toContain(
    `plugins: [{ plugin: p0, ...{} }], view: "spotlight" });`,
  );
  expect(prepare({ view: 'spotlight' }).view).toBe('spotlight');
  expect(prepare({}).view).toBeUndefined();
  expect(() => prepare({ view: 'stage' as never })).toThrow(`use 'popup' or 'spotlight'`);
});
