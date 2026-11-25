import { expect, test } from 'bun:test';

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { profileOf } from '#src/cli/board.ts';
import type { Kept } from '#src/plugins/recordings/index.ts';
import { type Listed, type Model, tasks } from '#src/plugins/tasks/index.ts';
import { localBoard } from '#src/plugins/tasks/local.ts';
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

/** The environment with nothing of its own that says who runs it, and `who`. */
function agent(who: Record<string, string> = { CLAUDECODE: '1' }) {
  return { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !WHO.test(name))), ...who };
}

function as(who: Record<string, string>, cwd: string, ...args: string[]) {
  const run = Bun.spawnSync([process.execPath, CLI, ...args], { cwd, env: agent(who) });
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
  expect(deictic(root, 'help', 'task').out).toContain('Usage: deictic task [options] <id>');
  const wrong = deictic(root, 'nope');
  expect(wrong.code).toBe(1);
  expect(wrong.err).toContain("unknown command 'nope'");
  expect(deictic(root, 'task', '--nope').err).toContain("unknown option '--nope'");
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
        op: {
          text: 'Make it bolder',
          page: `${ORIGIN}/pricing`,
          viewport: { width: 390, height: 844 },
          count: 1,
          chain: ['Hero (src/Hero.tsx:4)'],
          annotations: { count: 1, notes: ['Bolder'] },
          pointed: { path: 'span.icon', html: '<span class="icon"></span>' },
        },
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
  expect(task.out).toContain('Source: src/App.tsx:1 ← Hero (src/Hero.tsx:4)');
  expect(task.out).toContain('Notes drawn on the page: "Bolder"');
  expect(task.out).toContain('Pointed at, inside it: span.icon (its HTML is in pointed.html)');
  expect(task.out).toContain(`File: ${join('src', 'App.tsx')}:1, as the task saw it.`);
  // One line for every download, not a command per file.
  expect(task.out).toContain(`To download what's attached: bunx deictic task ${id} --out <dir>`);
  expect(task.out).not.toContain('vb download');

  const watch = deictic(p.root, 'watch', 'cli', '--once');
  expect(watch.code).toBe(0);
  expect(watch.out).toContain('watching cli on http://127.0.0.1:');
  // The task in a line, not its labels.
  expect(watch.out).toContain(`ready: #${id} "Make it bolder" at src/App.tsx:1:`);
  expect(watch.out).not.toContain('deictic.');
  // As the agent, with nothing set but what its harness sets: its replies are left out, and nothing says to set a name.
  expect(watch.out).not.toContain('BOARD_PROFILE');
  // Gone with the watch: the page doesn't go on saying someone watches.
  expect(readdirSync(join(p.root, '.deictic', 'watchers'))).toEqual([]);

  expect(JSON.parse(deictic(p.root, 'vb', 'whoami', '--json').out)).toMatchObject({ profile: 'claude' });
  expect(JSON.parse(as({}, p.root, 'vb', 'whoami', '--json').out)).toMatchObject({ profile: null });
  expect(as({}, p.root, 'watch', 'cli', '--once').out).toContain('set BOARD_PROFILE=<your name>');

  // A problem of deictic's, posted as a task: said as one, with its details.
  await handle(
    new Request(`${ORIGIN}/__deictic/problem`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        key: 'page:x:set:boom',
        kind: 'bug',
        plugin: 'x',
        message: 'x failed to set up in the page: boom',
        details: 'at x.js:1',
      }),
    }),
  );
  let problem: Listed | undefined;
  for (let tries = 0; problem === undefined && tries < 50; tries++) {
    await Bun.sleep(50);
    const page = await handle(new Request(`${ORIGIN}/__deictic/plugins/tasks/page`));
    problem = ((await page!.json()) as { tasks: Listed[] }).tasks.find((t) => t.problem !== undefined);
  }
  const told = deictic(p.root, 'task', problem!.id).out;
  expect(told).toContain('X failed to set up in the page: boom');
  expect(told).toMatch(/A problem deictic [\d.]+ reported in its x plugin, not a person's ask/);
  expect(told).toContain('Details:\n```\nat x.js:1\n```');
}, 60_000);

test('a watch on a fresh board waits for its first task, and a task not over says no result', async () => {
  const p = project({ 'package.json': '{}' });
  // The board the dev server starts, with nothing posted yet: no channel.
  const board = await localBoard(p.root, { inspect: false });
  try {
    const idle = deictic(p.root, 'watch', 'fresh', '--once', '--idle', '3s');
    expect(idle.err).toBe('');
    expect(idle.out).toContain('watching fresh on http://127.0.0.1:');
    expect(idle.code).toBe(2);

    // The first task, while one watches: what it waited for.
    const watch = Bun.spawn([process.execPath, CLI, 'watch', 'fresh', '--once'], { cwd: p.root, env: agent(), stderr: 'pipe' });
    const out = new Response(watch.stdout).text();
    await Bun.sleep(3000);
    const { task: made } = JSON.parse(deictic(p.root, 'vb', 'tasks', 'create', 'fresh', 'Make it bolder', '--json').out) as {
      task: { id: string };
    };
    expect(await watch.exited).toBe(0);
    // Named with the project's runner: this one's is the repository's, Bun.
    expect(await out).toContain(`new task #${made.id}: "Make it bolder". Read it: bunx deictic task ${made.id}`);

    const task = deictic(p.root, 'task', made.id);
    expect(task.err).toBe('');
    expect(task.out).not.toContain('null');
  } finally {
    board.stop();
  }
}, 60_000);

test('a watch follows a board started again from where it was, saying it went and came back', async () => {
  const p = project({ 'package.json': '{}' });
  let board = await localBoard(p.root, { inspect: false });
  try {
    const create = (text: string) =>
      (JSON.parse(deictic(p.root, 'vb', 'tasks', 'create', 'deictic', text, '--json').out) as { task: { id: string } }).task.id;
    const done = create('Done before the restart');
    const watch = Bun.spawn([process.execPath, CLI, 'watch'], { cwd: p.root, env: agent(), stderr: 'pipe' });
    const out = new Response(watch.stdout).text();
    const err = new Response(watch.stderr).text();
    await Bun.sleep(3000);
    deictic(p.root, 'vb', 'tasks', 'claim', done, '--lease', '5m');
    deictic(p.root, 'vb', 'tasks', 'complete', done, 'done');

    // As the dev server restarting does: its board stops, and another starts, whose token is new. On the same port the
    // tail is refused; on another, it's left asking the old one, so the watch goes there itself.
    const restart = async (port: number) => {
      board.stop();
      await Bun.sleep(2000);
      board = await localBoard(p.root, { inspect: false, port });
      await Bun.sleep(5000);
    };
    await restart(Number(new URL(board.url).port));
    const between = create('Made between the restarts');
    await Bun.sleep(2000);
    const elsewhere = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
    const port = elsewhere.port;
    elsewhere.stop(true);
    await restart(port);
    const after = create('Made after the restarts');
    await Bun.sleep(3000);
    watch.kill();

    const lines = (await out).split('\n');
    expect(lines.filter((l) => l.startsWith('ready:'))).toEqual([expect.stringContaining(`#${done}`)]);
    expect(lines).toContainEqual(
      expect.stringMatching(/^the board went away \(vb tail exited 1: The board didn't accept your credentials\.\): waiting for it/),
    );
    expect(lines).toContainEqual(`the board went away (started again on http://127.0.0.1:${port}/api/board): waiting for it to come back`);
    expect(lines.filter((l) => l.startsWith('the board is back on '))).toHaveLength(2);
    expect(lines).toContainEqual(expect.stringContaining(`new task #${between}: "Made between the restarts"`));
    expect(lines).toContainEqual(expect.stringContaining(`new task #${after}: "Made after the restarts"`));
    // The CLI's own error is the watch's line above, not a line of its own.
    expect(await err).toBe('');
  } finally {
    board.stop();
  }
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
  const p = project({ 'package.json': '{}' });
  // As Vite serves a file from outside its root: `/@fs/S:/…` on Windows, `/@fs/home/…` elsewhere.
  const fs = p.root.replaceAll('\\', '/').replace(/^\/?/, '/');
  const note = { id: 'a', shape: { kind: 'note', at: { x: 1, y: 2 }, text: 'here' } };
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
        data: {
          plugin: 'rrweb/console@1',
          payload: {
            level: 'error',
            payload: ['"Save failed"'],
            trace: ['save (App.tsx:12)', `load (${ORIGIN}/src/main.tsx?t=1712:3:9)`, `place (${ORIGIN}/@fs${fs}/dist/x.js?v=ab12:1:2)`],
          },
        },
      },
      {
        type: 5,
        timestamp: t + 2000,
        data: {
          tag: 'deictic.annotations',
          payload: { annotations: [note] },
        },
      },
      {
        type: 5,
        timestamp: t + 2200,
        data: {
          tag: 'deictic.annotations',
          payload: { annotations: [note, { id: 'b', shape: { kind: 'box', x: 0, y: 0, width: 9, height: 9 } }] },
        },
      },
      { type: 5, timestamp: t + 2400, data: { tag: 'deictic.annotations', payload: { annotations: [] } } },
      { type: 5, timestamp: t + 3000, data: { tag: 'deictic.end', payload: {} } },
    ],
  };
  mkdirSync(join(p.root, '.deictic', 'recordings'), { recursive: true });
  writeFileSync(join(p.root, '.deictic', 'recordings', 'rec-1.json'), JSON.stringify(kept));

  const all = deictic(p.root, 'recording', 'rec-1');
  expect(all.err).toBe('');
  expect(all.out).toContain('click         text "Save" at src/App.tsx:9:7 at (40,20) in the viewport');
  expect(all.out).toContain('console.error Save failed');
  expect(all.out).toContain('marks         + note at (1,2): "here"');
  expect(all.out).toContain('marks         − all 2 marks');
  expect(all.out).toContain('end           recording stopped');
  expect(all.out).toContain('1 problem: --problems lists them');

  const problems = deictic(p.root, 'recording', 'rec-1', '--problems');
  expect(problems.out).toContain('1 of its 7 lines, as asked');
  expect(problems.out).toContain('at save (App.tsx:12)');
  // The page's own URLs as paths, without a bundler's cache-busting query.
  expect(problems.out).toContain('at load (/src/main.tsx:3:9)');
  expect(problems.out).toContain('at place (dist/x.js:1:2)');
  expect(problems.out).not.toContain('click');

  const json = JSON.parse(deictic(p.root, 'recording', 'rec-1', '--only', 'click', '--json').out) as {
    lines: number;
    timeline: { kind: string }[];
  };
  expect(json.lines).toBe(7);
  expect(json.timeline.map((l) => l.kind)).toEqual(['click']);
});

test('cleans what deictic kept after saying what and how big, and leaves the history and board to a stopped dev server', () => {
  const p = project({
    'package.json': '{}',
    // An npm project's: the commands it names are npx's.
    'package-lock.json': '{}',
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
  expect(clean('nope').err).toContain("'nope' is invalid for argument 'parts'");

  const ended = Bun.spawnSync([process.execPath, '--version']).pid;
  p.write('.deictic/board.json', JSON.stringify({ url: 'http://127.0.0.1:4100/api/board', pid: ended, as: '' }));
  expect(clean('all', 'transcribe', '--yes').code).toBe(0);
  expect(readdirSync(join(p.root, '.deictic')).toSorted()).toEqual(['recordings', 'screenshots', 'voice']);
  expect(readdirSync(cache)).toEqual([]);
});

test("recording says React's commits where it had them on, a slow one a problem, and their components with --full", () => {
  const t = 1_700_000_000_000;
  const p = project({ 'package.json': '{}' });
  const react = (at: number, payload: object) => ({ type: 5, timestamp: t + at, data: { tag: 'deictic.react', payload } });
  const kept: Kept = {
    page: `${ORIGIN}/`,
    viewport: { width: 800, height: 600 },
    startedAt: t,
    duration: 3000,
    events: [
      { type: 4, timestamp: t, data: { href: `${ORIGIN}/`, width: 800, height: 600 } },
      { type: 2, timestamp: t, data: { node: { id: 1, type: 0, childNodes: [] } } },
      react(500, { on: true }),
      react(1000, {
        commits: 3,
        ms: 38.2,
        priority: 'user-blocking',
        components: [
          { name: 'SearchResults', at: 'src/Search.tsx:20', ms: 36, selfMs: 31, why: 'props changed: query' },
          { name: 'ResultRow', count: 120, selfMs: 4, why: 'its parent rendered' },
        ],
        more: 2,
      }),
      react(1500, { commits: 1, ms: 0.4, priority: 'immediate', components: [{ name: 'Toggle', why: 'state changed' }] }),
      // The rest of a busy second, as one: many quick commits, and one slow.
      react(1800, {
        commits: 40,
        ms: 80,
        slowest: 31,
        over: 800,
        priority: 'normal',
        components: [{ name: 'Ticker', count: 40, selfMs: 40, why: 'state changed' }],
      }),
      react(2000, { on: false }),
      { type: 5, timestamp: t + 3000, data: { tag: 'deictic.end', payload: {} } },
    ],
  };
  mkdirSync(join(p.root, '.deictic', 'recordings'), { recursive: true });
  writeFileSync(join(p.root, '.deictic', 'recordings', 'rec-2.json'), JSON.stringify(kept));

  const all = deictic(p.root, 'recording', 'rec-2', '--only', 'react');
  expect(all.err).toBe('');
  expect(all.out).toContain('react         commits recorded from here');
  expect(all.out).toContain(
    'react         38ms (user-blocking, 3 commits): SearchResults 31ms (props changed: query), ResultRow ×120 4.0ms (its parent rendered), and 2 more',
  );
  expect(all.out).toContain('react         0.4ms (immediate): Toggle (state changed)');
  expect(all.out).toContain('react         commits no longer recorded');
  expect(all.out).toContain('react         80ms (normal, 40 commits over 0.8s, slowest 31ms): Ticker ×40 40ms (state changed)');
  // Slower than a frame: what makes a page stutter.
  const problems = deictic(p.root, 'recording', 'rec-2', '--problems');
  expect(problems.out).toContain('SearchResults');
  expect(problems.out).not.toContain('Toggle');
  expect(problems.out).toContain('Ticker');
  // Asked for nothing: the slow one, as a problem, and the rest counted, with what lists them.
  const plain = deictic(p.root, 'recording', 'rec-2');
  expect(plain.out).toContain('SearchResults');
  expect(plain.out).not.toContain('Toggle');
  expect(plain.out).not.toContain('commits recorded from here');
  expect(plain.out).toContain('Not listed: 3 React lines (--only react); --all lists every line');
  expect(deictic(p.root, 'recording', 'rec-2', '--all').out).toContain('Toggle (state changed)');
  // A moment is every line of it.
  expect(deictic(p.root, 'recording', 'rec-2', '--around', '1.5').out).toContain('Toggle (state changed)');
  // And a script has every line.
  expect(JSON.parse(deictic(p.root, 'recording', 'rec-2', '--json').out).timeline).toHaveLength(7);
  const full = deictic(p.root, 'recording', 'rec-2', '--only', 'react', '--full');
  expect(full.out).toContain('SearchResults · src/Search.tsx:20 · 36ms with what it rendered · props changed: query');
});
