# Watching

`npx deictic watch` prints a line per thing to act on: `ready: #68 …` for each task waiting as it starts, `new task`,
`reply on`, `task … canceled`. Each says what to do. Use what your harness has for being woken by a command:

- **A monitor** (each output line an event, like Claude Code's Monitor): run it as the monitor with the longest
  timeout allowed, and work each event while it keeps running. Start it again when the monitor times out.
- **A background command that wakes you when it exits**: `npx deictic watch --once` ends at the first event. Work
  it, then start it again.
- **Neither**: run `npx deictic watch --once` in the foreground after each task, and tell the person it holds the
  session.

It ends by itself after 20 quiet minutes (`--idle` for another), saying `idle`: then stop watching and tell the
person, unless you're mid-task. Never sleep-poll, and don't detach it (`nohup`, `&`): it ends with the process
that started it.

A claim is a 15-minute lease unless `--lease` (1h at most): `vb tasks renew 68` for longer work.
