# Setting deictic up

Only when the project doesn't have it yet, or the person asks. Check first: a `deictic` dependency and its plugin
in the bundler config. The package's `API.md` has the setup; each plugin's options are its factory's types.

## The package and the bundler

Install with the project's package manager (`npm install -D`, `bun add -d`, `pnpm add -D`, `yarn add -D`), the
plugins' dependencies with it (below), and add it to the bundler; each runs in the dev server only and takes the
same options:

| Bundler                              | Config                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Vite (and frameworks on it)          | `plugins: [deictic({ plugins })]`, `deictic` from `deictic/vite`                                                       |
| Next.js (`next dev`, either bundler) | `export default withDeictic(nextConfig, { plugins })`, from `deictic/next`                                             |
| webpack 5, Rspack                    | `plugins: [new DeicticPlugin({ plugins })]`, from `deictic/webpack`; `launch-editor` to open files                     |
| Bun (`Bun.serve` with HTML imports)  | `deictic/bun`: a plugin module named in `bunfig.toml`'s `[serve.static] plugins`, its `routes` spread into `Bun.serve` |
| Astro                                | `integrations: [deictic({ plugins })]`, from `deictic/astro`; `.astro` components are marked with Astro 7 or later     |

React Native isn't supported. With no plugins deictic loads nothing; `.deictic/` (kept data) ignores itself in git. A
plugin whose packages are missing says so as the dev server starts, with the command that installs them: run it.

## Which plugins: ask first

Before installing anything, ask the person in one message whether they want the recommended setup, and name the
other options so they can add or drop some:

> I'd set deictic up for tasks: Alt-click an element, describe the change, and attach a screenshot (which you can
> draw on), a screen recording, or your voice; it goes to a Vercel Board for me to work. That's the tasks,
> screenshots, annotations, recordings and voice plugins (a recording keeps the page's console and its requests too,
> secrets masked), plus `@vercel/board`, `rrweb`, `rrweb-player`, `rrweb-snapshot`, rrweb's console and network plugins
> and `playwright-core` as dev dependencies. Also available: Tailwind (edit an element's classes in place, no task
> needed), screenshots drawn in the page instead of a headless browser (`dom()`, for a page with no server to
> render on), a channel or labels for the tasks, and a shortcut other than Alt. Go with the recommended setup?

On yes, the recommended setup, in one step: `npx deictic init --no-skill` (`pnpm dlx`, `bunx` for those managers)
installs it all with the project's package manager and adds deictic to the bundler's config, or says what to add where
it can't tell where. By hand instead:

```bash
npm install -D deictic @vercel/board rrweb rrweb-player rrweb-snapshot playwright-core \
  @rrweb/rrweb-plugin-console-record @rrweb/rrweb-plugin-network-record
```

```ts
import { recommended } from 'deictic/recommended';

deictic({ plugins: recommended() });
```

Screenshots render in a Chromium: Playwright's (`npx playwright install chromium`), else Chrome or Edge if installed.

To fit what they choose instead: a plugin's options go under its name, `false` leaves one out
(`recommended({ tasks: { channel: 'ui' }, voice: false })`), and one outside the preset goes beside it
(`[...recommended(), tailwind()]`, `tailwind` from `deictic/tailwind`). Every plugin:

| Plugin          | What it adds                                                                            | Install too                                                           |
| --------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `tasks()`       | The Task tab; `{ channel, project, labels }` route and name them (`deictic` by default) | `@vercel/board`                                                       |
| `screenshots()` | A shot of the page attached to a task; `{ renderer: dom() }` in-page                    | `rrweb-snapshot`, `playwright-core` (`modern-screenshot` for `dom()`) |
| `annotations()` | Marks on the page, on shots (Annotate) and in recordings                                |                                                                       |
| `recordings()`  | Record beside Attach: a screen recording attached to a task                             | `rrweb`, `rrweb-player` (its replay)                                  |
| `voice()`       | The mic, in recordings and as voice notes in a task                                     |                                                                       |
| `logs()`        | The console's lines and uncaught errors in a recording; `{ levels }`                    | `@rrweb/rrweb-plugin-console-record`                                  |
| `network()`     | The page's requests in a recording, masked; `{ headers, body, mask, ignore }`           | `@rrweb/rrweb-plugin-network-record`                                  |
| `tailwind()`    | Edit an element's classes in place; `{ css: 'src/index.css' }` names the theme's sheet  |                                                                       |

`deictic({ shortcut })` changes Alt-click, or `false` for none. The plugins' order is the tabs' order: keep theirs.

A build has nothing of deictic. Only for a deployed demo with no dev server, `deictic/vite` takes
`standalone: 'src/standalone.ts'`: deictic is then in the build, and that module's default export (a `Standalone`,
from `deictic`: `(request: Request) => Response`) answers in the page what the dev server would under `/__deictic/`
(`read` → `{ model }`, `apply` → `{ model, change: { label } }`, `undo`, `redo`, `history`, each plugin's routes).
What keeps a shot (`add`), a voice clip (`add`, then `more/<id>`, the last with `?last`) or a recording (`begin`,
`part/<id>?seq=<n>`, then `end/<id>` or `discard/<id>`) may name the `url` it's kept at. For a recording that's a
replay page the build publishes: `replayPage({ player, source })` from `deictic/recordings` is its HTML.

## The board

Tasks go to a Vercel Board. With nothing set, the dev server starts one on this machine and stops it as it stops:
`http://127.0.0.1:4100/api/board` (another port where that one's taken), its log in `.deictic/board`. It prints the
URL as it starts and keeps it in `.deictic/board.json`:

```bash
export BOARD_PROFILE=claude  # your name: what you post is yours, not the person's
npx deictic vb whoami        # krtgo/claude, and the board's URL
```

`deictic vb` is the project's own `vb` (in `node_modules/.bin`, so rarely on the PATH), and like the other commands
it reads that file when `BOARD_URL` isn't set. A `vb` you run yourself needs the variable:
`export BOARD_URL=$(node -p "require('./.deictic/board.json').url")`. The board is there only while the dev server
runs.

For another board, set `BOARD_URL` for the dev server and for `vb` alike. For the team's, through `vercel login`,
with no `BOARD_URL`: `tasks({ board: board() })` in the bundler config (`board` from `@vercel/board`), or
`recommended({ tasks: { board: board() } })`. `board: local({ port, dir, inspect, args })`, with `local` from
`deictic/tasks`, is the board on this machine with those options (its port, its folder from the root, `false` for
none of its pages, more of `vb serve`'s arguments), and whatever `BOARD_URL` says.

## This skill

```bash
npx skills add gkurt/deictic  # or ./node_modules/deictic, the installed package's; -a <agent> to pick agents, -g for global
```

Then restart the agent if it only reads skills as it starts.
