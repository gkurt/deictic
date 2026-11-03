# Setting deictic up

Only when the project doesn't have it yet, or the person asks. Check first: a `deictic` dependency and its plugin
in the bundler config. The package's README has every option.

## The package and the bundler

Install with the project's package manager (`npm install -D`, `bun add -d`, `pnpm add -D`, `yarn add -D`), the
plugins' dependencies with it (below), and add it to the bundler; each runs in the dev server only and takes the
same options:

| Bundler                             | Config                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Vite (and frameworks on it)         | `plugins: [deictic({ plugins })]`, `deictic` from `deictic/vite`                                                       |
| Next.js (`next dev`, Turbopack)     | `export default withDeictic(nextConfig, { plugins })`, from `deictic/next`                                             |
| webpack 5, Rspack                   | `plugins: [new DeicticPlugin({ plugins })]`, from `deictic/webpack`; `launch-editor` to open files                     |
| Bun (`Bun.serve` with HTML imports) | `deictic/bun`: a plugin module named in `bunfig.toml`'s `[serve.static] plugins`, its `routes` spread into `Bun.serve` |
| Astro                               | `integrations: [deictic({ plugins })]`, from `deictic/astro`                                                           |

React Native isn't supported. With no plugins deictic loads nothing; `.deictic/` (kept data) ignores itself in git.

## Which plugins: ask first

Before installing anything, ask the person in one message whether they want the recommended setup, and name the
other options so they can add or drop some:

> I'd set deictic up for tasks: Alt-click an element, describe the change, and attach a screenshot (which you can
> draw on), a screen recording, or your voice; it goes to a Vercel Board for me to work. That's the tasks,
> screenshots, annotations, recordings and voice plugins, plus `@vercel/board`, `rrweb`, `rrweb-player`, `rrweb-snapshot` and
> `playwright-core` as dev dependencies. Also available: Tailwind (edit an element's classes in place, no task
> needed), screenshots drawn in the page instead of a headless browser (`dom()`, for a page with no server to
> render on), a channel or labels for the tasks, and a shortcut other than Alt. Go with the recommended setup?

On yes, the recommended setup:

```bash
npm install -D deictic @vercel/board rrweb rrweb-player rrweb-snapshot playwright-core
```

```ts
import { annotations } from 'deictic/annotations';
import { recordings } from 'deictic/recordings';
import { screenshots } from 'deictic/screenshots';
import { tasks } from 'deictic/tasks';
import { voice } from 'deictic/voice';

deictic({ plugins: [tasks(), screenshots(), annotations(), recordings(), voice()] });
```

Screenshots render in a Chromium: Playwright's (`npx playwright install chromium`), else Chrome or Edge if installed.

Every plugin, to fit what they choose instead:

| Plugin          | What it adds                                                          | Install too                                                           |
| --------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `tasks()`       | The Task tab; `{ channel, labels }` route them (`deictic` by default) | `@vercel/board`                                                       |
| `screenshots()` | A shot of the page attached to a task; `{ renderer: dom() }` in-page  | `rrweb-snapshot`, `playwright-core` (`modern-screenshot` for `dom()`) |
| `annotations()` | Marks on the page, on shots (Annotate) and in recordings              |                                                                       |
| `recordings()`  | Record beside Attach: a screen recording attached to a task           | `rrweb`, `rrweb-player` (its replay)                                  |
| `voice()`       | The mic, in recordings and as voice notes in a task                   |                                                                       |
| `tailwind()`    | Edit an element's classes in place                                    |                                                                       |

`deictic({ shortcut })` changes Alt-click, or `false` for none. The plugins' order is the tabs' order: keep theirs.

## The board

Tasks go to a Vercel Board. Either one on this machine:

```bash
npx vb serve                                      # http://127.0.0.1:4100/api/board, kept in .board/
BOARD_URL=http://127.0.0.1:4100/api/board <the dev command>
```

or the team's board, with no `BOARD_URL`, after `vercel login`. Whatever the dev server uses, the agent's `vb` must
use too: export the same `BOARD_URL` where you run `vb`, and check with `vb whoami`.

## This skill

```bash
npx skills add ./node_modules/deictic     # from the installed package; -a <agent> to pick agents, -g for global
```

Then restart the agent if it only reads skills as it starts.
