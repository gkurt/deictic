---
packages:
  'deictic': minor
---

### Tasks: a board out of the box

With no `board` option and no `BOARD_URL`, the tasks plugin now starts a board of the project's own with the dev server (`vb serve`, from `@vercel/board`) and stops it with it: `http://127.0.0.1:4100/api/board`, or a free port where that one's taken, its log in `.deictic/board`. `.deictic/board.json` holds its URL, which the skill's scripts read when `BOARD_URL` isn't set.

`local()` from `deictic/tasks` is that board as the `board` option, whatever `BOARD_URL` says, with its `port`, its `dir`, `inspect: false` and more `args` for `vb serve`: `tasks({ board: local({ port: 4200 }) })`.

Before, the case with neither went to your team's board through `vercel login`. For that now, pass it: `tasks({ board: board() })`, with `board` from `@vercel/board`.
