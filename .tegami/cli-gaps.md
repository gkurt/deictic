---
packages:
  'deictic': patch
---

### `deictic watch` starts on a fresh board, and the commands name the project's own runner

- `deictic watch` makes its channel where the board has none yet, instead of failing until the first task is posted.
- `deictic task` no longer prints `Result: null` and `Reason: null` for a task that isn't over.
- The commands each command's output names use the project's runner (`bunx deictic`, `pnpm exec deictic`, `yarn deictic`), so an agent following them doesn't get npm's notices in every command's output; the skill says the same.
