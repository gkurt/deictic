## deictic@0.2.0

### Tasks: a board out of the box

With no `board` option and no `BOARD_URL`, the tasks plugin now starts a board of the project's own with the dev server (`vb serve`, from `@vercel/board`) and stops it with it: `http://127.0.0.1:4100/api/board`, or a free port where that one's taken, its log in `.deictic/board`. `.deictic/board.json` holds its URL, which the skill's scripts read when `BOARD_URL` isn't set.

`local()` from `deictic/tasks` is that board as the `board` option, whatever `BOARD_URL` says, with its `port`, its `dir`, `inspect: false` and more `args` for `vb serve`: `tasks({ board: local({ port: 4200 }) })`.

Before, the case with neither went to your team's board through `vercel login`. For that now, pass it: `tasks({ board: board() })`, with `board` from `@vercel/board`.

### `standalone`: deictic on a deployed page, for a demo

`deictic/vite` takes `standalone`, a module of the page's that answers the overlay's requests where there's no dev server: with it, a build is marked and has the overlay. Without it, a build has nothing of deictic, as before. `replayPage()` from `deictic/recordings` is the replay page to publish beside such a build.

### `deictic`'s types are its own again

`import type { ServerPlugin } from 'deictic'` found no such export: the build had put a shared chunk, exported under one-letter names, where the entry's types go.

## deictic@0.1.0

### First release

Point at an element in your running app and leave a task about it on a Vercel Board, with a screenshot to draw on, a screen recording or a voice note, on Vite, webpack, Rspack, Next, Bun and Astro. `recommended()` from `deictic/recommended` sets the task plugins up in one line.
