# Watching for tasks

The point is that a task left in the page gets worked without anyone prompting you. Use whatever your harness has
for being woken by a command's output; between tasks, never sleep-poll in the foreground.

`<skill>` below is this skill's folder; `deictic` is the channel (pass yours if the config sets another).

## With a monitor (Claude Code's Monitor, or any tool that turns each output line into an event)

Run `node <skill>/scripts/watch.mjs deictic` as the monitor, with the longest timeout it allows, and start it again
when it expires. It prints, one line each:

- `ready: #68 …` for each task already waiting as it starts;
- `new task #71: "Make it bolder" at src/App.tsx:12:5 on /`;
- `reply on #71 by krtgo: …`: an answer to your question, or more to do on a task;
- `task #71 canceled: …`: the person undid it in the page; stop, and put back what you changed for it;
- `watch ended …`: the board went away; check `vb whoami`, then start it again.

On an event, work the task ([tasks.md](tasks.md)) while the monitor keeps running. Ignore replies you wrote yourself.

## With a background command that exits (one wake-up per task)

Where you're notified when a background command ends but can't stream events, run in the background:

```bash
vb tasks claim --ready deictic --wait 30m --lease 30m
```

It blocks until a task is ready, claims it and prints it, and exits; it exits 1 with nothing claimed after 30
minutes. Work the task, then start it again. To be woken without claiming (to answer replies too):
`vb wait deictic --label deictic.at --timeout 30m`.

## Without either

Run that same `vb tasks claim --ready deictic --wait 30m` in the foreground at the end of each task: your turn
waits for the next one. Tell the person that's how you're waiting, as it holds the session.

## Things to know

- A claim is a lease (15 minutes unless `--lease`, at most 1h). For longer work, `vb tasks renew <id>`.
- `vb tasks deictic` lists what's open; `--state ready` what's waiting.
- Several agents can watch one channel: a claim is what keeps two from taking the same task.
- Undo in the page cancels a task only while no one has claimed it; after that the person replies instead.
