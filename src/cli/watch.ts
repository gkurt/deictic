/**
 * `deictic watch`: the board's tasks for deictic, one line per thing to act on: the tasks ready now as it starts,
 * then each new task, a reply on one, and one canceled (undone in the page, say). Made for an agent's monitor (each
 * line an event). A board that goes away (the dev server restarted, and its board with it, maybe on another port) is
 * waited for and followed again from where it was left; it says so, and ends only if none comes back. It ends by itself once nothing has
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

import { answers, boardIn, boardUrl, deicticDirs, duration, ME, type Message, vbCommand, vbJson, whoami } from './board.ts';

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

/** What `vb` said as it failed: its JSON's `message`, or its last line. */
function reasonOf(said: string): string | undefined {
  const last = said.trim().split('\n').at(-1)?.trim();
  if (last === undefined || last === '') return undefined;
  try {
    const { message } = JSON.parse(last) as { message?: unknown };
    return typeof message === 'string' ? message : last;
  } catch {
    return last;
  }
}

export function run(channel: string, values: { idle: string; once?: boolean; label?: string[] }): void {
  const labels = (values.label ?? []).flatMap((l) => ['--label', l]);
  const idle = duration(values.idle);
  const say = (line: string) => console.log(line.replace(/\s+/g, ' ').trim());
  const first = (text: string) => (text.split('\n---')[0] ?? '').trim().slice(0, 160);
  // A task in a line: its words and where, not its labels, which `task` reads out.
  const about = (text: string, labels: Record<string, string> | undefined) => {
    const label = (key: string) => labels?.[key];
    const at = label('deictic.at');
    const page = label('deictic.page');
    const project = label('deictic.project');
    return `"${first(text)}"${at ? ` at ${at}` : ''}${page ? ` on ${page}` : ''}${project ? ` in ${project}` : ''}`;
  };

  // A board nothing has posted to yet has no channel, and won't list or follow one it hasn't: made here, as the first
  // task would make it. One that's there stays as it is; where the board won't let this make one, `vb tasks` says so.
  const made = () => {
    const [command, argv, options] = vbCommand(['channels', 'create', channel]);
    spawnSync(command, argv, options);
  };
  made();
  // Where the channel is now, taken before what's ready is: followed from here, nothing posted between is missed, and
  // a tail started again after the board went away follows on from what this one heard, never from a list taken earlier.
  let cursor = vbJson<{ cursor: string }>(['read', channel, '--limit', '1']).cursor;
  const ready = vbJson<{ tasks: { message: Message }[] }>(['tasks', channel, '--state', 'ready', ...labels]).tasks.map((t) => t.message);
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
  // With no profile (an agent `profileOf` doesn't know), the person's replies and the watcher's own are one actor's:
  // none can be left out.
  if (me.profile === null) {
    say(
      `you write as ${me.handle ?? me.actor}, the person's own identity, as nothing here says which agent you are: set BOARD_PROFILE=<your name> (claude, codex) on every command, this watch too, and start it again`,
    );
  }
  // The tasks said, by ID: one made after the cursor above and listed as ready is said once.
  const told = new Set(ready.map((m) => String(m.id)));
  for (const m of ready) say(`ready: #${m.id} ${about(m.text, m.labels)}. Read it: ${ME} task ${m.id}`);
  if (values.once && ready.length > 0) end(0);

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
  const heardOf = (line: string) => {
    let e: Tailed;
    try {
      e = JSON.parse(line) as Tailed;
    } catch {
      return;
    }
    // The last event heard, which a tail started again follows from: nothing left while the board was away is missed.
    if (e.cursor !== undefined) cursor = e.cursor;
    heard();
    const p = e.payload ?? {};
    if (e.type === 'message.posted' && p.re === null && p.thread !== undefined) roots.set(p.thread, about(p.text ?? '', p.labels));
    if (e.type === 'task.created' && !told.has(String(p.id)))
      event(`new task #${p.id}: ${roots.get(p.thread ?? -1) ?? ''}. Read it: ${ME} task ${p.id}`);
    if (e.type === 'message.posted' && p.re !== null && p.re !== undefined) {
      if (me.profile !== null && p.by?.actor === me.actor) return;
      const by = e.message?.author?.handle ?? p.by?.actor ?? 'someone';
      event(`reply on #${p.re} by ${by}: ${first(p.text ?? '')}`);
    }
    if (e.type === 'task.canceled')
      event(`task #${p.id} canceled: ${p.reason ?? ''}. Stop work on it, and put back what you changed for it.`);
  };

  const over = (why: string) => {
    say(`watch ended (${why}): start it again`);
    end(1);
  };

  /** Follows the channel from `cursor`, and again when the board comes back after going away. */
  const follow = (again: boolean) => {
    const started = Date.now();
    const [command, argv, options] = vbCommand(['tail', channel, ...labels, '--after', cursor, '--json']);
    const child = spawn(command, argv, { env: options.env, shell: options.shell, stdio: ['ignore', 'pipe', 'pipe'] });
    tail = child;
    createInterface({ input: child.stdout }).on('line', heardOf);
    // What it said as it ended goes in the watch's own line: a board started again refuses the old token, as expected,
    // and the CLI's raw error isn't something for an agent to act on.
    let said = '';
    child.stderr.on('data', (chunk: Buffer) => (said += chunk.toString()));
    // A dev server started again may start its board on another port: the tail would go on asking the old one for
    // ever, so it's ended once the project's `.deictic/board.json` names another, and followed there.
    const at = boardUrl();
    let moved: string | undefined;
    const elsewhere = setInterval(() => {
      const now = boardUrl();
      if (now === at || now === undefined) return;
      moved = now;
      child.kill();
    }, 3000);
    child.on('exit', (code) => {
      clearInterval(elsewhere);
      const reason = reasonOf(said);
      const why = moved === undefined ? `vb tail exited ${code}${reason === undefined ? '' : `: ${reason}`}` : `started again on ${moved}`;
      if (again && moved === undefined && Date.now() - started < SOON) return over(why);
      say(`the board went away (${why}): waiting for it to come back`);
      const until = Date.now() + BACK;
      const tried = () => {
        // Asked anew each time: a board started again may be at another URL, and the CLI gets itself a new token for it.
        if (answers()) {
          say(`the board is back on ${boardUrl() ?? "the team's board"}: watching ${channel} again`);
          // A board started anew (its folder cleaned) has no channel again.
          made();
          return follow(true);
        }
        if (Date.now() > until) return over(why);
        setTimeout(tried, 2000);
      };
      setTimeout(tried, 2000);
    });
  };
  follow(false);
}
