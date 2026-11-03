/**
 * A board on this machine for as long as the dev server runs: `vb serve`, keeping its tasks in
 * `site/.board`, so Alt-click adds a task with nothing else to start. `BOARD_URL` set beforehand
 * means a board of your own, and none is started. The page reads the board's URL as
 * `import.meta.env.BOARD_URL`, to say where its tasks are.
 *
 * Vite restarts its server in this process when the config changes, which loads this module again:
 * the board is kept on `globalThis` across that and stopped only when the process exits, and the
 * `BOARD_URL` set for it isn't mistaken for one of your own.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import type { Plugin } from 'vite';

const PORT = 4100;
const OURS = Symbol.for('deictic-site/board');

type Ours = { url: string; child?: ChildProcess };
const page = globalThis as { [OURS]?: Ours };

export function localBoard(): Plugin {
  const ours = page[OURS];
  const url = ours?.url ?? process.env.BOARD_URL ?? `http://127.0.0.1:${PORT}/api/board`;
  const own = ours !== undefined || process.env.BOARD_URL === undefined;
  return {
    name: 'local-board',
    apply: 'serve',
    config: () => ({ define: { 'import.meta.env.BOARD_URL': JSON.stringify(url) } }),
    configureServer(server) {
      if (!own) return;
      const state = (page[OURS] ??= { url });
      // Read by `@vercel/board`'s `board()` when the tasks plugin first asks it.
      process.env.BOARD_URL = url;
      if (state.child !== undefined && state.child.exitCode === null) return;
      const cli = join(dirname(createRequire(import.meta.url).resolve('@vercel/board/package.json')), 'dist', 'cli.mjs');
      const dir = join(server.config.root, '.board');
      const child = spawn(process.execPath, [cli, 'serve', '--port', String(PORT), '--no-open', '--dir', dir], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      state.child = child;
      child.stdout?.once('data', () =>
        server.config.logger.info(`  ➜  Board:   ${url.replace(/\/api\/board$/, '/')} (tasks in site/.board)`),
      );
      child.stderr?.on('data', (chunk: Buffer) =>
        server.config.logger.warn(
          `board: ${chunk.toString().trim()} (is another board on port ${PORT}? stop it, or set BOARD_URL to use it)`,
        ),
      );
      process.once('exit', () => child.kill());
    },
  };
}
