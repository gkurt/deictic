import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { deicticRecommended } from '#src/plugins/recommended/index.ts';
import { tailwind } from '#src/plugins/tailwind/index.ts';
import { checkPlugins } from '#src/tools/plugins.ts';
import { clientModule } from '#src/vite.ts';

test('is tasks, screenshots, annotations, recordings and voice, in the order of their tabs, then what a recording has besides', () => {
  expect(deicticRecommended({ react: false }).map((p) => p.name)).toEqual([
    'tasks',
    'screenshots',
    'annotations',
    'recordings',
    'voice',
    'logs',
    'network',
  ]);
});

test("reads React's state where the project has React, found from where the dev server starts", () => {
  // This repository has React.
  expect(deicticRecommended().map((p) => p.name)).toContain('react');
  expect(deicticRecommended({ react: { components: 2 } }).at(-1)).toMatchObject({ name: 'react', clientOptions: { components: 2 } });
  const cwd = process.cwd();
  const plain = mkdtempSync(join(tmpdir(), 'deictic-preset-'));
  try {
    process.chdir(plain);
    expect(deicticRecommended().map((p) => p.name)).not.toContain('react');
    // Asked for, it's there all the same.
    expect(deicticRecommended({ react: {} }).map((p) => p.name)).toContain('react');
  } finally {
    process.chdir(cwd);
    rmSync(plain, { recursive: true, force: true });
  }
});

test("a recording's logs and requests are each left out with false, and both without recordings", () => {
  const names = (options: Parameters<typeof deicticRecommended>[0]) => deicticRecommended(options).map((p) => p.name);
  expect(names({ react: false, logs: false })).toEqual(['tasks', 'screenshots', 'annotations', 'recordings', 'voice', 'network']);
  expect(names({ react: false, network: false })).toEqual(['tasks', 'screenshots', 'annotations', 'recordings', 'voice', 'logs']);
  expect(names({ react: false, recordings: false })).toEqual(['tasks', 'screenshots', 'annotations', 'voice']);
});

test("passes each plugin its options, and leaves out one that's false", () => {
  const plugins = deicticRecommended({
    tasks: { shortcut: { modifiers: ['Alt', 'Shift'] } },
    voice: false,
    recordings: false,
    react: false,
  });
  expect(plugins.map((p) => p.name)).toEqual(['tasks', 'screenshots', 'annotations']);
  expect(plugins[0]!.shortcut).toEqual({ modifiers: ['Alt', 'Shift'] });
});

test('starts, alone or beside another plugin, with every page half imported', () => {
  const plugins = [...deicticRecommended(), tailwind()];
  expect(() => checkPlugins(plugins)).not.toThrow();
  const code = clientModule(plugins, '/');
  for (const name of ['tasks', 'screenshots', 'annotations', 'recordings', 'voice', 'logs', 'network', 'react', 'tailwind'])
    expect(code).toMatch(new RegExp(`from "deictic/${name}/(client|rrweb)"`));
});
