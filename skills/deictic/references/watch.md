# Watching for tasks

The point is that a task left in the page gets worked without anyone prompting you. Use whatever your harness has
for being woken by a command's output; between tasks, never sleep-poll in the foreground.

`<skill>` below is this skill's folder; `deictic` is the channel (pass yours if the config sets another). `vb` is
`node <skill>/scripts/vb.mjs`. Set `BOARD_PROFILE=<your name>` for the watch as for everything else.

Always watch with `watch.mjs`, not with `vb` by itself: while it runs, the person's Task tab says you're watching
(`claude watching`, beside the channel), which is how they know a task they add is taken up. A board can't tell
them.

## A watch ends when nothing happens

Don't watch for ever. `watch.mjs` ends by itself once nothing has happened on the channel for 20 minutes
(`--idle 45m` for another stretch; your own claims and replies count as something), printing `idle: …` and
exiting 2. Then:

- **Don't start it again by yourself.** Tell the person in one line that you've stopped watching; watch again when
  they ask, or give you a task.
- Only if you were in the middle of a task when it ended, start it once more when that task is done.

That's different from your harness cutting the watch off while the channel was busy (a monitor's timeout): then
start it again at once.

## With a monitor (Claude Code's Monitor, or any tool that turns each output line into an event)

Run `node <skill>/scripts/watch.mjs deictic` as the monitor, with the longest timeout it allows (Claude Code's: 30
minutes), and start it again when the monitor expires, unless the watch said `idle` first. It prints, one line each:

- `ready: #68 …` for each task already waiting as it starts;
- `new task #71: "Make it bolder" at src/App.tsx:12:5 on /`;
- `reply on #71 by krtgo: …`: an answer to your question, or more to do on a task. Your own replies aren't
  printed, as long as you have a profile: with none you write as the person, the watch can't tell you apart, and
  it says so as it starts;
- `task #71 canceled: …`: the person undid it in the page; stop, and put back what you changed for it;
- `idle: …`: nothing in 20 minutes, the watch is over (above);
- `watch ended …`: the board went away; check `vb whoami`, then start it again.

On an event, work the task ([tasks.md](tasks.md)) while the monitor keeps running.

## With a background command that exits (one wake-up per task)

Where you're notified when a background command ends but can't stream events, run in the background:

```bash
node <skill>/scripts/watch.mjs deictic --once
```

It prints the tasks ready now and exits, or with none, waits for the first new task, reply or cancellation, prints
it and exits 0. Work it (claim the task first: [tasks.md](tasks.md)), then start it again. It exits 2 with an
`idle: …` line after 20 quiet minutes: then stop, as above.

## Without either

Run that same `watch.mjs deictic --once` in the foreground at the end of each task: your turn waits for the next
one. Tell the person that's how you're waiting, as it holds the session.

## Things to know

- A claim is a lease (15 minutes unless `--lease`, at most 1h). For longer work, `vb tasks renew <id>`.
- `vb tasks deictic` lists what's open; `--state ready` what's waiting.
- Several agents can watch one channel: a claim is what keeps two from taking the same task.
- Undo in the page cancels a task only while no one has claimed it; after that the person replies instead.
- The Task tab knows of a watch run from the project's folder (it keeps a file under `.deictic/watchers` while it
  runs). One killed is gone from the page within a minute. While you hold a claim it says you're there too, watch
  or no watch.
- The watch ends when the process that started it does, so one left behind by a session that's over doesn't go on
  saying you watch. Run it as your harness's own command (its monitor, its background command), not detached from
  a shell that then exits (`nohup`, `&` and `disown`): that one ends in seconds.
