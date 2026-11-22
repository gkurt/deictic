#!/usr/bin/env node
// Watches the board for deictic's tasks and prints one line per thing to act on: the tasks ready now as it
// starts, then each new task, a reply on one, and one canceled (undone in the page, say). Made for an agent's
// monitor (each line an event). A board that goes away (the dev server restarted, and its board with it) is
// waited for and followed again from where it was left; it says so, and ends only if none comes back. It ends by itself once nothing has happened
// on the channel for `--idle` (20m): a watch nobody feeds isn't started again, so no agent watches for ever.
// With `--once` it ends at the first thing to act on, for a harness that's woken only when a command exits.
// It ends, too, when the process that started it does: nobody reads its lines then.
// While it runs the project's Task tab shows who watches (`watching`, in lib.mjs). Replies the watcher wrote
// itself are left out where it has a name of its own (BOARD_PROFILE): with none it writes as the person.
// Usage: watch.mjs [channel, default deictic] [--idle 20m] [--once] [--label k=v ...]
// Exits 0 after `--once`'s event, 2 when idle, 1 when the board went away.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { answers, boardUrl, duration, parseArgs, vb, vbCommand, watching, whoami } from './lib.mjs';

const { options, rest } = parseArgs(process.argv.slice(2), ['once']);
const channel = rest[0] ?? 'deictic';
const labels = (options.label ?? []).flatMap((l) => ['--label', l]);
const idle = options.idle?.[0] ?? '20m';
const say = (line) => console.log(line.replace(/\s+/g, ' ').trim());
const first = (text) => (text.split('\n---')[0] ?? '').trim().slice(0, 160);

const ready = vb(['tasks', channel, '--state', 'ready', ...labels]).trim();
const me = whoami();
const unseen = watching(channel, me.profile ?? me.name ?? me.handle ?? me.actor);
let tail;
const end = (code) => {
  unseen();
  tail?.removeAllListeners('exit');
  tail?.kill();
  process.exit(code);
};
// Stopped by its monitor, where the system says so: the page isn't left thinking someone watches.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => end(0));

// Whoever started the watch reads its lines. With that gone (a session that ended and left the watch behind) no
// one does, and the page mustn't go on saying an agent watches. A dead parent shows as another parent's ID, except
// on Windows, where the ID stays and the system is asked whether it's still a process.
const parent = process.ppid;
const orphaned = () => {
  if (process.ppid !== parent) return true;
  try {
    process.kill(parent, 0);
    return false;
  } catch (e) {
    return e.code === 'ESRCH';
  }
};
setInterval(() => orphaned() && end(0), 5000);

say(`watching ${channel} on ${boardUrl() ?? "the team's board"} as ${me.handle ?? me.actor}`);
// With no profile, the person's replies and the watcher's own are one actor's: none can be left out.
if (!me.profile) {
  say(
    `you write as ${me.handle ?? me.actor}, the person's own identity: set BOARD_PROFILE=<your name> (claude, codex) for every vb command, this watch too, and start it again`,
  );
}
const waiting = (ready ? ready.split('\n') : []).filter((line) => /^#\d+/.test(line));
for (const line of waiting) say(`ready: ${line}`);
if (options.once && waiting.length > 0) end(0);

/** One thing to act on: all `--once` waits for. */
const event = (line) => {
  say(line);
  if (options.once) end(0);
};

// Anything on the channel puts the end off, the watcher's own claims and replies too: it's being worked.
let quiet;
const heard = () => {
  clearTimeout(quiet);
  quiet = setTimeout(() => {
    say(
      `idle: nothing on ${channel} in ${idle}, so the watch is over. Don't start it again by yourself: tell the person in a line that you've stopped watching, and watch again when they ask. Only if you're working a task now, start it once more when that's done.`,
    );
    end(2);
  }, duration(idle));
};
heard();

// What the board says about each thread: its root's first line and where, to name it when a task is made.
const roots = new Map();
// The last event heard, which a tail started again follows from: nothing left while the board was away is missed.
let cursor;
const heardOf = (line) => {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    return;
  }
  if (e.cursor !== undefined) cursor = e.cursor;
  heard();
  const p = e.payload ?? {};
  if (e.type === 'message.posted' && p.re === null) {
    const at = p.labels?.['deictic.at'];
    roots.set(
      p.thread,
      `"${first(p.text ?? '')}"${at ? ` at ${at}` : ''}${p.labels?.['deictic.page'] ? ` on ${p.labels['deictic.page']}` : ''}${p.labels?.['deictic.project'] ? ` in ${p.labels['deictic.project']}` : ''}`,
    );
  }
  if (e.type === 'task.created') event(`new task #${p.id}: ${roots.get(p.thread) ?? ''}. Read it: vb read ${p.id}`);

  if (e.type === 'message.posted' && p.re !== null && p.re !== undefined) {
    if (me.profile && p.by?.actor === me.actor) return;
    const by = e.message?.author?.handle ?? p.by?.actor ?? 'someone';
    event(`reply on #${p.re} by ${by}: ${first(p.text ?? '')}`);
  }
  if (e.type === 'task.canceled') event(`task #${p.id} canceled: ${p.reason ?? ''}. Stop work on it.`);
};

/** How long a board that went away is waited for: a dev server's restart takes a few seconds. */
const BACK = 60_000;
/** A tail that ends sooner than this after it's started again isn't started a third time: the board isn't the trouble. */
const SOON = 10_000;

const over = (code) => {
  say(`watch ended (vb tail exited ${code}): start it again`);
  end(1);
};

/** Follows the channel, from `cursor` on where there is one, and again when the board comes back after going away. */
const follow = (again) => {
  const started = Date.now();
  const from = cursor === undefined ? [] : ['--after', cursor];
  const [command, argv, spawnOptions] = vbCommand(['tail', channel, ...labels, ...from, '--json']);
  tail = spawn(command, argv, { ...spawnOptions, stdio: ['ignore', 'pipe', 'inherit'] });
  createInterface({ input: tail.stdout }).on('line', heardOf);
  tail.on('exit', (code) => {
    if (again && Date.now() - started < SOON) return over(code);
    say(`the board went away (vb tail exited ${code}): waiting for it to come back`);
    const until = Date.now() + BACK;
    const tried = () => {
      // Asked anew each time: a board started again may be at another URL, and the CLI gets itself a new token for it.
      if (answers()) {
        say(`the board is back on ${boardUrl() ?? "the team's board"}: watching ${channel} again`);
        // With nothing heard before it went, what's ready is all there is to go by.
        if (cursor === undefined) {
          const now = vb(['tasks', channel, '--state', 'ready', ...labels]).trim();
          for (const line of now.split('\n').filter((l) => /^#\d+/.test(l) && !waiting.includes(l))) event(`ready: ${line}`);
        }
        return follow(true);
      }
      if (Date.now() > until) return over(code);
      setTimeout(tried, 2000);
    };
    setTimeout(tried, 2000);
  });
};
follow(false);
