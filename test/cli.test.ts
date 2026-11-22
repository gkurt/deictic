import { expect, test } from 'bun:test';

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { profileOf } from '#src/cli/board.ts';
import type { Kept } from '#src/plugins/recordings/index.ts';
import { type Model, tasks } from '#src/plugins/tasks/index.ts';
import { endpoints, redirect } from '#src/tools/endpoints.ts';

import { project } from './fixture.ts';

const CLI = join(import.meta.dir, '..', 'src', 'cli.ts');
const ORIGIN = 'http://localhost:5173';

/** What says who runs it: none of the environment's, so a test's is all there is. */
const WHO =
  /^(BOARD_URL|BOARD_PROFILE|AI_AGENT|CLAUDECODE|CLAUDE_CODE|CODEX_.*|GEMINI_CLI|CURSOR_AGENT|COPILOT_.*|OPENCODE|AUGMENT_AGENT|GOOSE_PROVIDER|JUNIE_.*)$/;

/** The `deictic` command, run in `cwd` as Claude Code would (`CLAUDECODE`), with no board but the project's. */
function deictic(cwd: string, ...args: string[]) {
  return as({ CLAUDECODE: '1' }, cwd, ...args);
}

function as(who: Record<string, string>, cwd: string, ...args: string[]) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !WHO.test(name)));
  const run = Bun.spawnSync([process.execPath, CLI, ...args], { cwd, env: { ...env, ...who } });
  return { code: run.exitCode, out: run.stdout.toString(), err: run.stderr.toString() };
}

test('writes as the agent its environment names, as BOARD_PROFILE says where set, and as the person at a terminal', () => {
  expect(profileOf({ CLAUDECODE: '1' })).toBe('claude');
  expect(profileOf({ CODEX_THREAD_ID: 'x', AI_AGENT: 'other' })).toBe('codex');
  expect(profileOf({ AI_AGENT: 'claude-code_2-1-330_agent' })).toBe('claude');
  expect(profileOf({ AI_AGENT: 'github_copilot_vscode_agent' })).toBe('copilot');
  expect(profileOf({ AI_AGENT: 'amp' })).toBe('amp');
  expect(profileOf({ BOARD_PROFILE: 'reviewer', CLAUDECODE: '1' })).toBe('reviewer');
  // Not a name a board takes: none, and the watch says to set one.
  expect(profileOf({ AI_AGENT: '9lives' })).toBeUndefined();
  expect(profileOf({ CLAUDECODE: '', TERM_PROGRAM: 'vscode' })).toBeUndefined();
});

test('says its commands, and refuses one it has not', () => {
  const { root } = project({ 'package.json': '{}' });
  const help = deictic(root, '--help');
  expect(help.code).toBe(0);
  for (const name of ['init', 'clean', 'vb', 'watch', 'task', 'recording', 'frame', 'voice', 'transcribe'])
    expect(help.out).toContain(`  ${name} `);
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
  // As the agent, with nothing set but what its harness sets: its replies are left out, and nothing says to set a name.
  expect(watch.out).not.toContain('BOARD_PROFILE');
  // Gone with the watch: the page doesn't go on saying someone watches.
  expect(readdirSync(join(p.root, '.deictic', 'watchers'))).toEqual([]);

  expect(JSON.parse(deictic(p.root, 'vb', 'whoami', '--json').out)).toMatchObject({ profile: 'claude' });
  expect(JSON.parse(as({}, p.root, 'vb', 'whoami', '--json').out)).toMatchObject({ profile: null });
  expect(as({}, p.root, 'watch', 'cli', '--once').out).toContain('set BOARD_PROFILE=<your name>');
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
  expect(all.out).toContain('1 problem: --problems lists them');

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

test('cleans what deictic kept after saying what and how big, and leaves the history and board to a stopped dev server', () => {
  const p = project({
    'package.json': '{}',
    '.deictic/screenshots/a.png': 'png',
    '.deictic/recordings/b.json': '{}',
    '.deictic/recordings/c.part': '[]',
    '.deictic/voice/d.webm': 'webm',
    '.deictic/history.json': '{"done":[],"undone":[]}',
    '.deictic/board/local.db': 'db',
    '.deictic/board.json': JSON.stringify({ url: 'http://127.0.0.1:4100/api/board', pid: process.pid, as: '' }),
  });
  const cache = join(p.root, 'cache');
  mkdirSync(join(cache, 'transcribe'), { recursive: true });
  const clean = (...args: string[]) => as({ DEICTIC_CACHE: cache }, p.root, 'clean', ...args);
  const kept = (dir: string) => readdirSync(join(p.root, '.deictic', dir));

  // No terminal to ask on: a list, and nothing deleted. Only this project's, or the run below would delete others'.
  const listed = clean();
  expect(listed.code).toBe(0);
  expect(listed.out).not.toContain('..');
  expect(listed.out).toContain(join('.deictic', 'screenshots'));
  expect(listed.out).not.toContain('history');
  expect(listed.out).toContain('npx deictic clean --yes deletes these');
  expect(kept('screenshots')).toEqual(['a.png']);

  expect(clean('--yes').out).toContain('Deleted');
  expect([...kept('screenshots'), ...kept('voice')]).toEqual([]);
  // A recording still going is left.
  expect(kept('recordings')).toEqual(['c.part']);

  const refused = clean('board', '--yes');
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("is the running dev server's: stop it");
  expect(clean('nope').err).toContain('no "nope" to clean');

  const ended = Bun.spawnSync([process.execPath, '--version']).pid;
  p.write('.deictic/board.json', JSON.stringify({ url: 'http://127.0.0.1:4100/api/board', pid: ended, as: '' }));
  expect(clean('all', 'transcribe', '--yes').code).toBe(0);
  expect(readdirSync(join(p.root, '.deictic')).toSorted()).toEqual(['recordings', 'screenshots', 'voice']);
  expect(readdirSync(cache)).toEqual([]);
});
