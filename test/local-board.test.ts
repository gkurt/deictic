import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { local, tasks } from '#src/plugins/tasks/index.ts';
import { localBoard } from '#src/plugins/tasks/local.ts';
import { endpoints, redirect } from '#src/tools/endpoints.ts';

import { project } from './fixture.ts';

test("starts the project's own board, says where in .deictic/board.json, and finds it running the next time", async () => {
  const { root } = project({ 'package.json': '{ "name": "shop" }\n' });
  const board = await localBoard(root);
  try {
    expect(board.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/board$/);
    expect(((await (await fetch(board.url)).json()) as { url: string }).url).toBe(board.url);
    expect(JSON.parse(readFileSync(join(root, '.deictic/board.json'), 'utf8'))).toMatchObject({ url: board.url, pid: expect.any(Number) });
    expect(existsSync(join(root, '.deictic/board'))).toBe(true);

    // A dev server that restarts in its process asks again: the same board, and not its to stop.
    const again = await localBoard(root);
    expect(again.url).toBe(board.url);
    again.stop();
    expect((await fetch(board.url)).ok).toBe(true);
  } finally {
    board.stop();
  }
}, 30_000);

test('takes a port, a folder and no inspector, and replaces a board running with other options', async () => {
  const { root } = project({ 'package.json': '{ "name": "shop" }\n' });
  const first = await localBoard(root);
  // Another port, and one there is: with 4100 taken the first is any free one, which may be near the last.
  const taken = Number(new URL(first.url).port);
  const port = taken > 60_000 ? taken - 1000 : taken + 1000;
  const second = await localBoard(root, { port, dir: 'kept/board', inspect: false });
  try {
    expect(second).toMatchObject({ url: `http://127.0.0.1:${port}/api/board`, fresh: true });
    expect(existsSync(join(root, 'kept/board'))).toBe(true);
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(404);
    // One log, one board: the first is gone.
    expect(
      await fetch(first.url).then(
        (res) => res.ok,
        () => false,
      ),
    ).toBe(false);
  } finally {
    first.stop();
    second.stop();
  }
}, 60_000);

test('local() is the board even where BOARD_URL names another, which is left as it was', async () => {
  const p = project({ 'src/App.tsx': 'export const App = () => <h1>x</h1>;\n' });
  const before = process.env.BOARD_URL;
  process.env.BOARD_URL = 'http://127.0.0.1:9/api/board';
  try {
    const handle = endpoints({ root: p.root, plugins: [tasks({ board: local({ inspect: false }) })], open: () => redirect('/') });
    const res = (await handle(
      new Request('http://localhost:5173/__deictic/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
        body: JSON.stringify({ plugin: 'tasks', target: p.target('src/App.tsx', 'h1') }),
      }),
    ))!;
    expect(await res.json()).toEqual({ model: { channel: 'deictic', tasks: [], watching: [] } });
    expect(process.env.BOARD_URL).toBe('http://127.0.0.1:9/api/board');
  } finally {
    if (before === undefined) delete process.env.BOARD_URL;
    else process.env.BOARD_URL = before;
    const { pid } = JSON.parse(readFileSync(join(p.root, '.deictic/board.json'), 'utf8')) as { pid: number };
    process.kill(pid);
  }
}, 60_000);
