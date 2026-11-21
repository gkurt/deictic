---
packages:
  'deictic': minor
---

### Tasks: a board out of the box

With no `board` option and no `BOARD_URL`, the tasks plugin now starts a board of the project's own with the dev server (`vb serve`, from `@vercel/board`) and stops it with it: `http://127.0.0.1:4100/api/board`, or a free port where that one's taken, its log in `.deictic/board`. `.deictic/board.json` holds its URL, which the skill's scripts read when `BOARD_URL` isn't set.

Before, that case went to your team's board through `vercel login`. For that now, pass it: `tasks({ board: board() })`, with `board` from `@vercel/board`.
