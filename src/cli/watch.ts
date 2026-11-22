/**
 * `deictic watch`: the board's tasks for deictic, one line per thing to act on: the tasks ready now as it starts,
 * then each new task, a reply on one, and one canceled (undone in the page, say). Made for an agent's monitor (each
 * line an event). A board that goes away (the dev server restarted, and its board with it) is waited for and followed
 * again from where it was left; it says so, and ends only if none comes back. It ends by itself once nothing has
 * happened on the channel for `--idle` (20m): a watch nobody feeds isn't started again, so no agent watches for ever.
 * With `--once` it ends at the first thing to act on, for a harness that's woken only when a command exits. It ends,
 * too, when the process that started it does: nobody reads its lines then.
 *
 * While it runs the project's Task tab shows who watches (`watcherAt`). Replies the watcher wrote itself are left out
 * where it has a name of its own (BOARD_PROFILE): with none it writes as the person. Exits 0 after `--once`'s event,
 * 2 when idle, 1 when the board went away.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

import { watcherAt } from '#src/plugins/tasks/watchers.ts';

import { answers, boardIn, boardUrl, deicticDirs, duration, parseArgs, vb, vbCommand, whoami } from './board.ts';

export const usage = 'watch [channel] [--idle 20m] [--once] [--label k=v]   a line per new task, reply and cancellation';

/** What `vb tail --json` prints, one per line. */
interface Tailed {
  type: string;
  cursor?: string;
  payload?: {
    id?: number;
    thread?: number;
    re?: number | null;
    text?: string;
    reason?: string;
    labels?: Record<string, string>;
    by?: { actor: string };
  };
  message?: { author?: { handle?: string } };
}

/** How long a board that went away is waited for: a dev server's restart takes a few seconds. */
const BACK = 60_000;
/** A tail that ends sooner than this after it's started again isn't started a third time: the board isn't the trouble. */
const SOON = 10_000;

/** Each process's parent, by ID, asked of the system once: empty where it can't say. */
function parents(): Map<number, number> {
  const run =
    process.platform === 'win32'
      ? spawnSync(
          'powershell',
          ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | % { "$($_.ProcessId) $($_.ParentProcessId)" }'],
          {
            encoding: 'utf8',
          },
        )
      : spawnSync('ps', ['-A', '-o', 'pid=', '-o', 'ppid='], { encoding: 'utf8' });
  const map = new Map<number, number>();
  for (const line of (run.stdout ?? '').split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (pid !== undefined && ppid !== undefined && Number.isInteger(pid) && Number.isInteger(ppid)) map.set(pid, ppid);
  }
  return map;
}

/**
 * The processes above this one's parent, the nearest `count` of them. A runner (`npx`, `pnpm exec`, and on Windows the
 * shell and the bin's `.cmd` shim it runs) sits between the watch and the shell that ran it, and outlives that shell.
 */
function ancestors(count: number): number[] {
  const of = parents();
  const out: number[] = [];
  for (let pid = of.get(process.ppid); pid !== undefined && pid > 1 && out.length < count && !out.includes(pid); pid = of.get(pid))
    out.push(pid);
  return out;
}

/** Whether a process is gone. On Windows a dead parent's ID stays a child's `ppid`, so the system is asked. */
function gone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (e) {
    return (e as { code?: string }).code === 'ESRCH';
  }
}

export function run(args: string[]): void {
  const { values, positionals } = parseArgs(args, {
    idle: { type: 'string', default: '20m' },
    once: { type: 'boolean' },
    label: { type: 'string', multiple: true },
  });
  const channel = positionals[0] ?? 'deictic';
  const labels = (values.label ?? []).flatMap((l) => ['--label', l]);
  const idle = duration(values.idle);
  const say = (line: string) => console.log(line.replace(/\s+/g, ' ').trim());
  const first = (text: string) => (text.split('\n---')[0] ?? '').trim().slice(0, 160);

  const ready = vb(['tasks', channel, '--state', 'ready', ...labels]).trim();
  const me = whoami();
  // In the `.deictic/` whose board this is, or in each one near here where the board is the environment's.
  const url = boardUrl();
  const dirs = deicticDirs();
  const own = dirs.filter((dir) => boardIn(dir) === url);
  const unseen = watcherAt(own.length > 0 ? own : dirs, me.profile ?? me.name ?? me.handle ?? me.actor, channel);
  let tail: ChildProcess | undefined;
  const end = (code: number) => {
    unseen();
    tail?.removeAllListeners('exit');
    tail?.kill();
    process.exit(code);
  };
  // Stopped by its monitor, where the system says so: the page isn't left thinking someone watches.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => end(0));

  // Whoever started the watch reads its lines. With that gone (a session that ended and left the watch behind) no one
  // does, and the page mustn't go on saying an agent watches. Run through a runner, the shell is a few processes up,
  // so those are watched too: any gone, and the watch ends. A dead parent shows as another parent's ID, except on
  // Windows, where the system is asked whether it's still a process.
  const parent = process.ppid;
  const above = ancestors(3);
  const orphaned = () => process.ppid !== parent || gone(parent) || above.some(gone);
  setInterval(() => orphaned() && end(0), 5000);

  say(`watching ${channel} on ${url ?? "the team's board"} as ${me.handle ?? me.actor}`);
  // With no profile, the person's replies and the watcher's own are one actor's: none can be left out.
  if (me.profile === null) {
    say(
      `you write as ${me.handle ?? me.actor}, the person's own identity: set BOARD_PROFILE=<your name> (claude, codex) for every vb command, this watch too, and start it again`,
    );
  }
  const waiting = (ready ? ready.split('\n') : []).filter((line) => /^#\d+/.test(line));
  for (const line of waiting) say(`ready: ${line}`);
  if (values.once && waiting.length > 0) end(0);

  /** One thing to act on: all `--once` waits for. */
  const event = (line: string) => {
    say(line);
    if (values.once) end(0);
  };

  // Anything on the channel puts the end off, the watcher's own claims and replies too: it's being worked.
  let quiet: ReturnType<typeof setTimeout> | undefined;
  const heard = () => {
    clearTimeout(quiet);
    quiet = setTimeout(() => {
      say(
        `idle: nothing on ${channel} in ${values.idle}, so the watch is over. Don't start it again by yourself: tell the person in a line that you've stopped watching, and watch again when they ask. Only if you're working a task now, start it once more when that's done.`,
      );
      end(2);
    }, idle);
  };
  heard();

  // What the board says about each thread: its root's first line and where, to name it when a task is made.
  const roots = new Map<number, string>();
  // The last event heard, which a tail started again follows from: nothing left while the board was away is missed.
  let cursor: string | undefined;
  const heardOf = (line: string) => {
    let e: Tailed;
    try {
      e = JSON.parse(line) as Tailed;
    } catch {
      return;
    }
    if (e.cursor !== undefined) cursor = e.cursor;
    heard();
    const p = e.payload ?? {};
    const label = (key: string) => p.labels?.[key];
    if (e.type === 'message.posted' && p.re === null && p.thread !== undefined) {
      const at = label('deictic.at');
      const page = label('deictic.page');
      const project = label('deictic.project');
      roots.set(p.thread, `"${first(p.text ?? '')}"${at ? ` at ${at}` : ''}${page ? ` on ${page}` : ''}${project ? ` in ${project}` : ''}`);
    }
    if (e.type === 'task.created') event(`new task #${p.id}: ${roots.get(p.thread ?? -1) ?? ''}. Read it: npx deictic task ${p.id}`);
    if (e.type === 'message.posted' && p.re !== null && p.re !== undefined) {
      if (me.profile !== null && p.by?.actor === me.actor) return;
      const by = e.message?.author?.handle ?? p.by?.actor ?? 'someone';
      event(`reply on #${p.re} by ${by}: ${first(p.text ?? '')}`);
    }
    if (e.type === 'task.canceled')
      event(`task #${p.id} canceled: ${p.reason ?? ''}. Stop work on it, and put back what you changed for it.`);
  };

  const over = (code: number | null) => {
    say(`watch ended (vb tail exited ${code}): start it again`);
    end(1);
  };

  /** Follows the channel, from `cursor` on where there is one, and again when the board comes back after going away. */
  const follow = (again: boolean) => {
    const started = Date.now();
    const from = cursor === undefined ? [] : ['--after', cursor];
    const [command, argv, options] = vbCommand(['tail', channel, ...labels, ...from, '--json']);
    const child = spawn(command, argv, { env: options.env, shell: options.shell, stdio: ['ignore', 'pipe', 'inherit'] });
    tail = child;
    createInterface({ input: child.stdout }).on('line', heardOf);
    child.on('exit', (code) => {
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
            for (const l of now.split('\n').filter((l) => /^#\d+/.test(l) && !waiting.includes(l))) event(`ready: ${l}`);
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
}
