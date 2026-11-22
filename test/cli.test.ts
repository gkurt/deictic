import { expect, test } from 'bun:test';

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Kept } from '#src/plugins/recordings/index.ts';
import { type Model, tasks } from '#src/plugins/tasks/index.ts';
import { endpoints, redirect } from '#src/tools/endpoints.ts';

import { project } from './fixture.ts';

const CLI = join(import.meta.dir, '..', 'src', 'cli.ts');
const ORIGIN = 'http://localhost:5173';

/** The `deictic` command, run in `cwd` as an agent would, with no board but the project's. */
function deictic(cwd: string, ...args: string[]) {
  const { BOARD_URL: _, ...env } = process.env;
  const run = Bun.spawnSync([process.execPath, CLI, ...args], { cwd, env: { ...env, BOARD_PROFILE: 'claude' } });
  return { code: run.exitCode, out: run.stdout.toString(), err: run.stderr.toString() };
}

test('says its commands, and refuses one it has not', () => {
  const { root } = project({ 'package.json': '{}' });
  const help = deictic(root, '--help');
  expect(help.code).toBe(0);
  for (const name of ['init', 'vb', 'watch', 'task', 'recording', 'frame', 'voice', 'transcribe']) expect(help.out).toContain(`  ${name} `);
  const wrong = deictic(root, 'nope');
  expect(wrong.code).toBe(1);
  expect(wrong.err).toContain('no command "nope"');
  expect(deictic(root, 'task', '--nope').err).toContain("Unknown option '--nope'");
});

test("reads a task on the project's own board, and a watch says what's ready and that it watches", async () => {
  const p = project({ 'package.json': '{ "name": "shop" }', 'src/App.tsx': 'export const App = () => <h1>Pricing</h1>;\n' });
  const handle = endpoints({ root: p.root, plugins: [tasks({ channel: 'cli' })], open: () => redirect('/') });
  const res = await handle(
    new Request(`${ORIGIN}/__deictic/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        plugin: 'tasks',
        target: p.target('src/App.tsx', 'h1'),
        op: { text: 'Make it bolder', page: `${ORIGIN}/pricing`, viewport: { width: 390, height: 844 }, count: 1 },
      }),
    }),
  );
  const { model } = (await res!.json()) as { model: Model };
  const id = model.tasks[0]!.id;
  // On the board the dev server started, `.deictic/board.json`'s, stopped as this process ends.

  const task = deictic(p.root, 'task', id);
  expect(task.err).toBe('');
  expect(task.out).toContain(`#${id} ready, asked by`);
  expect(task.out).toContain('Make it bolder');
  expect(task.out).toContain('src/App.tsx:1:');
  expect(task.out).toContain(`File: ${join(p.root, 'src/App.tsx')}:1, as the task saw it.`);

  const watch = deictic(p.root, 'watch', 'cli', '--once');
  expect(watch.code).toBe(0);
  expect(watch.out).toContain('watching cli on http://127.0.0.1:');
  expect(watch.out).toContain(`ready: #${id}`);
  // Gone with the watch: the page doesn't go on saying someone watches.
  expect(readdirSync(join(p.root, '.deictic', 'watchers'))).toEqual([]);
}, 60_000);

test('a recording kept in the project as a timeline, and the part of it asked for', () => {
  const button = {
    id: 5,
    type: 2,
    tagName: 'button',
    attributes: { 'data-deictic': 'src/App.tsx:9:7' },
    childNodes: [{ id: 6, type: 3, textContent: 'Save' }],
  };
  const html = { id: 1, type: 0, childNodes: [{ id: 2, type: 2, tagName: 'body', attributes: {}, childNodes: [button] }] };
  const t = 1_700_000_000_000;
  const kept: Kept = {
    page: `${ORIGIN}/`,
    viewport: { width: 800, height: 600 },
    startedAt: t,
    duration: 3000,
    events: [
      { type: 4, timestamp: t, data: { href: `${ORIGIN}/`, width: 800, height: 600 } },
      { type: 2, timestamp: t, data: { node: html } },
      { type: 3, timestamp: t + 1000, data: { source: 2, type: 2, id: 6, x: 40, y: 20 } },
      {
        type: 6,
        timestamp: t + 1500,
        data: { plugin: 'rrweb/console@1', payload: { level: 'error', payload: ['"Save failed"'], trace: ['save (App.tsx:12)'] } },
      },
      {
        type: 5,
        timestamp: t + 2000,
        data: {
          tag: 'deictic.annotations',
          payload: { annotations: [{ id: 'a', shape: { kind: 'note', at: { x: 1, y: 2 }, text: 'here' } }] },
        },
      },
      { type: 5, timestamp: t + 3000, data: { tag: 'deictic.end', payload: {} } },
    ],
  };
  const p = project({ 'package.json': '{}' });
  mkdirSync(join(p.root, '.deictic', 'recordings'), { recursive: true });
  writeFileSync(join(p.root, '.deictic', 'recordings', 'rec-1.json'), JSON.stringify(kept));

  const all = deictic(p.root, 'recording', 'rec-1');
  expect(all.err).toBe('');
  expect(all.out).toContain('click         text "Save" at src/App.tsx:9:7 at (40,20) in the viewport');
  expect(all.out).toContain('console.error Save failed');
  expect(all.out).toContain('marks         + note at (1,2): "here"');
  expect(all.out).toContain('end           recording stopped');

  const problems = deictic(p.root, 'recording', 'rec-1', '--problems');
  expect(problems.out).toContain('1 of its 5 lines, as asked');
  expect(problems.out).toContain('at save (App.tsx:12)');
  expect(problems.out).not.toContain('click');

  const json = JSON.parse(deictic(p.root, 'recording', 'rec-1', '--only', 'click', '--json').out) as {
    lines: number;
    timeline: { kind: string }[];
  };
  expect(json.lines).toBe(5);
  expect(json.timeline.map((l) => l.kind)).toEqual(['click']);
});
