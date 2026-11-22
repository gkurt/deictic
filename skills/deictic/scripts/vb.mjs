#!/usr/bin/env node
// The board's CLI as the other scripts run it: the project's own `@vercel/board`, which needn't be on the PATH,
// on the board the dev server uses (`BOARD_URL`, or with none, the one `.deictic/board.json` names).
// Usage: vb.mjs <anything vb takes>, as in: vb.mjs whoami · vb.mjs tasks claim 68 --lease 30m
import { spawnSync } from 'node:child_process';

import { fail, vbCommand } from './lib.mjs';

const [command, argv, options] = vbCommand(process.argv.slice(2));
const run = spawnSync(command, argv, { ...options, stdio: 'inherit' });
if (run.error) fail(`vb: ${run.error.message}. Install @vercel/board in the project, or put vb on the PATH.`);
process.exit(run.status ?? 1);
