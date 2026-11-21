#!/usr/bin/env node
// Watches the board for deictic's tasks and prints one line per thing to act on: the tasks ready now as it
// starts, then each new task, a reply on one, and one canceled (undone in the page, say). Made for an agent's
// monitor (each line an event); it runs until stopped, and says so if the board goes away.
// Usage: watch.mjs [channel, default deictic] [--label k=v ...]
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { boardUrl, parseArgs, vb, vbCommand } from './lib.mjs';

const { options, rest } = parseArgs(process.argv.slice(2));
const channel = rest[0] ?? 'deictic';
const labels = (options.label ?? []).flatMap((l) => ['--label', l]);
const say = (line) => console.log(line.replace(/\s+/g, ' ').trim());
const first = (text) => (text.split('\n---')[0] ?? '').trim().slice(0, 160);

const ready = vb(['tasks', channel, '--state', 'ready', ...labels]).trim();
say(`watching ${channel} on ${boardUrl() ?? "the team's board"}`);
for (const line of ready ? ready.split('\n') : []) if (/^#\d+/.test(line)) say(`ready: ${line}`);

// What the board says about each thread: its root's first line and where, to name it when a task is made.
const roots = new Map();
const [command, argv, spawnOptions] = vbCommand(['tail', channel, ...labels, '--json']);
const tail = spawn(command, argv, { ...spawnOptions, stdio: ['ignore', 'pipe', 'inherit'] });
createInterface({ input: tail.stdout }).on('line', (line) => {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    return;
  }
  const p = e.payload ?? {};
  if (e.type === 'message.posted' && p.re === null) {
    const at = p.labels?.['deictic.at'];
    roots.set(
      p.thread,
      `"${first(p.text ?? '')}"${at ? ` at ${at}` : ''}${p.labels?.['deictic.page'] ? ` on ${p.labels['deictic.page']}` : ''}${p.labels?.['deictic.project'] ? ` in ${p.labels['deictic.project']}` : ''}`,
    );
  }
  if (e.type === 'task.created') say(`new task #${p.id}: ${roots.get(p.thread) ?? ''}. Read it: vb read ${p.id}`);

  if (e.type === 'message.posted' && p.re !== null && p.re !== undefined) {
    const by = e.message?.author?.handle ?? p.by?.actor ?? 'someone';
    say(`reply on #${p.re} by ${by}: ${first(p.text ?? '')}`);
  }
  if (e.type === 'task.canceled') say(`task #${p.id} canceled: ${p.reason ?? ''}. Stop work on it.`);
});
tail.on('exit', (code) => {
  say(`watch ended (vb tail exited ${code}): start it again`);
  process.exit(1);
});
