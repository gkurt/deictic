import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { localBoard } from '#src/plugins/tasks/local.ts';

import { project } from './fixture.ts';

test("starts the project's own board, says where in .deictic/board.json, and finds it running the next time", async () => {
  const { root } = project({ 'package.json': '{ "name": "shop" }\n' });
  const board = await localBoard(root);
  try {
    expect(board.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/board$/);
    expect(((await (await fetch(board.url)).json()) as { url: string }).url).toBe(board.url);
    expect(JSON.parse(readFileSync(join(root, '.deictic/board.json'), 'utf8'))).toEqual({ url: board.url, pid: expect.any(Number) });
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
