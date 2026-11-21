# API

Setup for each bundler, the options, and how to write a plugin. The [README](README.md) has the short version. The
types are the full reference: every option is documented where it's declared.

- [Bundlers](#bundlers)
- [Options](#options)
- [Tasks](#tasks)
- [Screenshots, recordings and voice](#screenshots-recordings-and-voice)
- [Tailwind](#tailwind)
- [Standalone](#standalone)
- [Events](#events)
- [Writing a plugin](#writing-a-plugin)
- [How it works](#how-it-works)

## Bundlers

Every integration takes the same options and runs in the dev server only.

```ts
// Vite, and anything on it (React Router, TanStack Start…): vite.config.ts
import { deictic } from 'deictic/vite';
export default defineConfig({ plugins: [react(), deictic({ plugins: recommended() })] });

// Next.js (`next dev`, Turbopack or webpack): next.config.ts
import { withDeictic } from 'deictic/next';
export default withDeictic(nextConfig, { plugins: recommended() });

// webpack 5, Rspack: add `launch-editor` to open files in your editor
import { DeicticPlugin } from 'deictic/webpack';
export default { plugins: [new DeicticPlugin({ plugins: recommended() })] };

// Astro: astro.config.ts
import { deictic } from 'deictic/astro';
export default defineConfig({ integrations: [deictic({ plugins: recommended() })] });
```

Astro marks `.astro` components with Astro 7 or later, and JSX islands with any version.

Bun (`Bun.serve` with HTML imports) takes one module for both the bundler plugin and the routes:

```ts
// deictic.plugin.ts
import { deictic } from 'deictic/bun';
export default deictic({ plugins: recommended() });
```

```toml
# bunfig.toml
[serve.static]
plugins = ["./deictic.plugin.ts"]
```

```ts
// server.ts
import tools from './deictic.plugin.ts';
Bun.serve({ routes: { ...tools.routes, '/*': index } });
```

React Native isn't supported: there's no DOM to point at.

## Options

```ts
deictic({
  shortcut: { modifiers: ['Control', 'Shift'] }, // instead of Alt; `false` for none
  plugins: recommended({
    tasks: { channel: 'ui', project: 'storefront', labels: { team: 'web' } },
    screenshots: { maskAllInputs: true },
    voice: false,
  }),
});
```

| Option     | What it is                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `plugins`  | The plugins to load. None by default.                                                          |
| `shortcut` | `{ modifiers, button }`: held to outline, pressed to open. Alt and the left button by default. |

`recommended()`, from `deictic/recommended`, is tasks, screenshots, annotations, recordings and voice. Each takes its
options under its name, and `false` leaves it out. Other plugins, your own included, go beside it:
`plugins: [...recommended(), notes()]`. Each plugin is also its own import (`deictic/tasks`, `deictic/screenshots`…),
to pick them one by one.

What a project keeps (the history, shots, recordings, voice notes) is in `.deictic/`, which ignores itself in git.

## Tasks

`tasks(options)`, from `deictic/tasks`. Needs `@vercel/board`.

| Option     | Default                         | What it is                                                 |
| ---------- | ------------------------------- | ---------------------------------------------------------- |
| `board`    | `BOARD_URL`, else a local board | The board tasks go to                                      |
| `channel`  | `deictic`                       | The channel on it                                          |
| `project`  | your `package.json`'s `name`    | The `deictic.project` label, to share a board              |
| `labels`   | none                            | Your own labels on every task                              |
| `link`     | the local board's pages         | `(channel, task?) => url`, where the panel links a task to |
| `shortcut` | none                            | Opens the Task tab directly                                |

With nothing set, the dev server starts a board on your machine: `http://127.0.0.1:4100/`, kept in `.deictic/board`.
For another:

```bash
BOARD_URL=https://team.example/api/board vite  # any board, by its URL
```

```ts
import { board } from '@vercel/board';
import { local } from 'deictic/tasks';

recommended({ tasks: { board: board() } }); // your team's, after `vercel login`
recommended({ tasks: { board: local({ port: 4200 }) } }); // the one on your machine, whatever BOARD_URL says
```

`local()` takes `port`, `dir` (its folder, from the root), `inspect: false` for none of the board's own pages, and
`args`, more of `vb serve`'s.

A task is the words typed and its attachments. The rest is labels: `deictic.project`, `deictic.at` (the element's
`file:line:column`), `deictic.url`, `deictic.viewport` and more, with your own beside them.

In the Task tab:

- **Attach** adds a screenshot of the page, and **Annotate** opens it to draw boxes, arrows and notes on.
- **Record** records the page as you use it, drawing as you go, with the mic on if you like.
- **Voice** records a note.
- The tasks already about the element are listed. An ID opens the task on the board, and a task no one has claimed
  can be edited or deleted. Undo takes any of it back.

### The agent skill

deictic ships a skill that watches the channel and works each task as it arrives, with scripts that read a task,
turn a recording into a timeline, screenshot it at any moment and transcribe its voice notes:

```bash
npx skills add ./node_modules/deictic
```

## Screenshots, recordings and voice

| Plugin                | Needs                                                          | Options                                  |
| --------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| `deictic/screenshots` | `rrweb-snapshot` and `playwright-core`, or `modern-screenshot` | `renderer`, `keep` (100), `dir`, masking |
| `deictic/annotations` | nothing                                                        | `color`, `shortcut`                      |
| `deictic/recordings`  | `rrweb`, `rrweb-player`                                        | `keep` (20), `dir`, masking              |
| `deictic/voice`       | nothing                                                        | `keep` (50), `dir`                       |

Screenshots have two renderers:

```ts
import { dom, rrweb } from 'deictic/screenshots';

screenshots({ renderer: rrweb({ channel: 'chrome' }) }); // default: a snapshot, rendered in a headless browser
screenshots({ renderer: dom() }); // drawn in the page with modern-screenshot: no browser needed, less exact
```

`rrweb()` uses Playwright's Chromium (`npx playwright install chromium`), else Chrome or Edge; `channel` or
`executablePath` names one.

Masking follows [rrweb](https://github.com/rrweb-io/rrweb)'s names and defaults: `rr-block` blanks an element
(`blockClass`, `blockSelector`), `rr-mask` masks its text (`maskTextClass`, `maskTextSelector`), and `maskAllInputs`
masks every field. Passwords always are. Nothing of deictic's own UI is in a shot or a recording.

## Tailwind

Not in `recommended()`. `tailwind()`, from `deictic/tailwind`, adds a tab that edits the element's classes in place,
with completion, previews and undo, and writes them to the source. It needs Tailwind v4.

```ts
import { tailwind } from 'deictic/tailwind';

deictic({ plugins: [...recommended(), tailwind({ css: 'src/index.css' })] });
```

| Option      | Default                                     | What it is                                    |
| ----------- | ------------------------------------------- | --------------------------------------------- |
| `css`       | Tailwind's default theme                    | The stylesheet with your theme, from the root |
| `helpers`   | `cn`, `clsx`, `cx`, `twMerge`, `classNames` | Calls whose first argument is a class list    |
| `attribute` | `className`                                 | `class` for Solid and Preact                  |
| `shortcut`  | none                                        | Opens the tab directly                        |

## Standalone

A build has nothing of deictic. To show it on a deployed page with no dev server (a demo), `deictic/vite` takes
`standalone`: a module of the page's whose default export answers the overlay's requests there.

```ts
// vite.config.ts
deictic({ plugins, standalone: 'src/standalone.ts' });

// src/standalone.ts: a request the dev server would get under `/__deictic/`, and its answer
import type { Standalone } from 'deictic';
export default (async (request) => Response.json({ model: null })) satisfies Standalone;
```

What a plugin's `add` route would keep, the module keeps, and answers with the `url` it's at. A recording's is a
replay page for the build to publish: `replayPage({ player, source })`, from `deictic/recordings`, is its HTML.

## Events

The page hears these on `window`:

| Event           | When                          | `detail`                                               |
| --------------- | ----------------------------- | ------------------------------------------------------ |
| `deictic:open`  | the popup opens over the page | the element and the tab                                |
| `deictic:close` | it closes                     | none                                                   |
| `deictic:task`  | a task is added               | its ID, title, state, channel, element and attachments |

`openPopup(element, { tab })`, from `deictic/client`, opens the popup from a gesture of your own.

## Writing a plugin

A plugin has a server half, which runs beside the bundler, and a page half, which can draw a tab in the popup. Every
part is optional but its `name`.

```ts
// my-plugin/index.ts
import { definePlugin } from 'deictic';

export const notes = () =>
  definePlugin<Model, Op>({
    name: 'notes',
    client: 'my-plugin/client', // the page half, which the page imports
    read: ({ element }) => ({ … }), // what the tab shows for the element
    apply: (source, target, op) => [{ start, end, text }], // edits to the file, written by deictic, undoable
  });

// my-plugin/client.ts
import { defineClientPlugin } from 'deictic';

export default defineClientPlugin<Model, Op>({
  name: 'notes',
  label: 'Notes',
  mount(panel, { model, element, apply }) {
    // draw into `panel`; `apply(op)` writes, and answers the model read again
  },
});
```

- `routes` adds routes to the dev server, which the page half reaches with `request(route)`.
- `setup` answers an API for other plugins, which reach it with `context.use(name)`. That's how tasks attaches
  screenshots and recordings.
- A change that isn't to a file answers `{ done: record }`, and the plugin's `undo` and `redo` get the record back.
- Throw a `Refusal` for an op the plugin won't make. The panel shows its message.

The types in `deictic`'s index document each part.

## How it works

- A transform that runs before the framework's own adds `data-deictic="src/App.tsx:12:5"` to every host element
  (`div`, `button`) in `.jsx`, `.tsx` and `.js` modules and in `.astro` components. So it works for any framework
  that compiles JSX, server components too, and points at the element's own tag, not the component around it.
- Its endpoints are on the dev server's own origin, `/__deictic/*`, and take writes only as same-origin JSON, so no
  other site can make them and no token reaches the page.
- Every change goes into one history in `.deictic/history.json`. The popup's undo and redo walk the part of it that
  is the open tab's on the element it's open on. A plugin's own change, a task, is undone by the plugin.
