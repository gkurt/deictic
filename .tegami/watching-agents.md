---
packages:
  'deictic': minor
---

### The Task tab says whether an agent is watching, and a watch ends when the channel goes quiet

- Beside the channel the Task tab shows who's watching it (`claude watching`), or `no agent watching`: whether a task you add now is taken up. A board can't say who listens, so the skill's `watch.mjs` says it while it runs (a file under `.deictic/watchers`), and the tab's model has it as `watching`. An agent holding a claim on one of the channel's tasks counts too, so one at work between watches still shows. A custom `board` now needs `actors`, as `board()` has.
- `watch.mjs` ends by itself once nothing has happened on the channel for 20 minutes (`--idle`), and the skill has the agent stop there and say so, not start it again: no agent watches for ever. It also ends when the process that started it does, so a watch a finished session left behind doesn't go on showing.
- `watch.mjs --once` ends at the first task, reply or cancellation, for an agent that's woken only when a command exits. The skill uses it in place of `vb tasks claim --wait`, so those agents show as watching too.
