---
packages:
  'deictic': minor
---

### A recording has what the page logged while it went, and the errors nothing caught

- Each console line (`debug`, `log`, `info`, `warn`, `error`), uncaught error and unhandled rejection is in the recording as a custom event tagged `deictic.console`, with its level, its text and an error's stack, at the moment it happened. The skill's `recording.mjs` prints them in the timeline as `console.<level>` lines.
- The console is wrapped only while a recording is going, and put back when it ends: the rest of the time the browser's tools name your own code as each line's source, as before. `recordings({ console: false })` never wraps it.
