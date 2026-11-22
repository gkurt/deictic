import { expect, test } from 'bun:test';

import { recommended } from '#src/plugins/recommended/index.ts';
import { tailwind } from '#src/plugins/tailwind/index.ts';
import { checkPlugins } from '#src/tools/plugins.ts';
import { clientModule } from '#src/vite.ts';

test('is tasks, screenshots, annotations, recordings and voice, in the order of their tabs, then what a recording has besides', () => {
  expect(recommended().map((p) => p.name)).toEqual(['tasks', 'screenshots', 'annotations', 'recordings', 'voice', 'logs', 'network']);
});

test("a recording's logs and requests are each left out with false, and both without recordings", () => {
  const names = (options: Parameters<typeof recommended>[0]) => recommended(options).map((p) => p.name);
  expect(names({ logs: false })).toEqual(['tasks', 'screenshots', 'annotations', 'recordings', 'voice', 'network']);
  expect(names({ network: false })).toEqual(['tasks', 'screenshots', 'annotations', 'recordings', 'voice', 'logs']);
  expect(names({ recordings: false })).toEqual(['tasks', 'screenshots', 'annotations', 'voice']);
});

test("passes each plugin its options, and leaves out one that's false", () => {
  const plugins = recommended({ tasks: { shortcut: { modifiers: ['Alt', 'Shift'] } }, voice: false, recordings: false });
  expect(plugins.map((p) => p.name)).toEqual(['tasks', 'screenshots', 'annotations']);
  expect(plugins[0]!.shortcut).toEqual({ modifiers: ['Alt', 'Shift'] });
});

test('starts, alone or beside another plugin, with every page half imported', () => {
  const plugins = [...recommended(), tailwind()];
  expect(() => checkPlugins(plugins)).not.toThrow();
  const code = clientModule(plugins, '/');
  for (const name of ['tasks', 'screenshots', 'annotations', 'recordings', 'voice', 'logs', 'network', 'tailwind'])
    expect(code).toMatch(new RegExp(`from "deictic/${name}/(client|rrweb)"`));
});
