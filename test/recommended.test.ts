import { expect, test } from 'bun:test';

import { recommended } from '#src/plugins/recommended/index.ts';
import { tailwind } from '#src/plugins/tailwind/index.ts';
import { checkPlugins } from '#src/tools/plugins.ts';
import { clientModule } from '#src/vite.ts';

test('is tasks, screenshots, annotations, recordings and voice, in the order of their tabs', () => {
  expect(recommended().map((p) => p.name)).toEqual(['tasks', 'screenshots', 'annotations', 'recordings', 'voice']);
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
  for (const name of ['tasks', 'screenshots', 'annotations', 'recordings', 'voice', 'tailwind'])
    expect(code).toMatch(new RegExp(`from "deictic/${name}/(client|rrweb)"`));
});
