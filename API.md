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

`npx deictic init` sets a project up: it installs deictic and what its plugins use with the project's package manager,
adds it to the bundler's config, and offers the agent skill (`--dry-run`, `--no-install`, `--skill`, `--no-skill`).
For Bun it writes `deictic.plugin.ts`, names it in `bunfig.toml` and spreads its routes into `Bun.serve`'s, where a
server of the project's has Bun bundle an HTML page (a Bun project that runs Vite or Next.js is theirs). This is what
it adds, and what to add by hand where it can't (a config it can't read). Every integration takes the same options
and runs in the dev server only.

```ts
// Vite, and anything on it (React Router, TanStack Start…): vite.config.ts
import { deictic } from 'deictic/vite';
export default defineConfig({ plugins: [react(), deictic({ plugins: recommended() })] });

// Next.js (`next dev`, Turbopack or webpack): next.config.ts
import { withDeictic } from 'deictic/next';
export default withDeictic(nextConfig, { plugins: recommended() });

// webpack 5, Rspack (`launch-editor` opens files in your editor)
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

`recommended()`, from `deictic/recommended`, is tasks, screenshots, annotations, recordings and voice, and logs and
network, which put the page's console and its requests in a recording. Each takes its
options under its name, and `false` leaves it out (`recommended({ logs: false, network: false })`). Other plugins, your own included, go beside it:
`plugins: [...recommended(), notes()]`. Each plugin is also its own import (`deictic/tasks`, `deictic/screenshots`…),
to pick them one by one.

What a project keeps (the history, shots, recordings, voice notes) is in `.deictic/`, which ignores itself in git.
Each plugin keeps only its latest (`keep`), so it doesn't grow for ever. `npx deictic clean` deletes the shots,
recordings and voice notes after saying how much they take and asking (tasks carry theirs on the board); name
`history`, `board` (the local board's tasks) or `all` for the rest, with the dev server stopped, and `transcribe` for
the transcription model, which is outside the project. With no terminal to ask on, it lists them, and deletes with `--yes`.

## Tasks

`tasks(options)`, from `deictic/tasks`. Needs `@vercel/board`.

| Option     | Default                         | What it is                                                 |
| ---------- | ------------------------------- | ---------------------------------------------------------- |
| `board`    | `BOARD_URL`, else a local board | The board tasks go to                                      |
| `channel`  | `deictic`                       | The channel on it                                          |
| `project`  | your `package.json`'s `name`    | The `deictic.project` label, to share a board              |
| `labels`   | none                            | Your own labels on every task                              |
| `link`     | the local board's pages         | `(channel, task?) => url`, where the panel links a task to |
| `html`     | `true`                          | Whether the Task tab offers to attach the element's HTML   |
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

In the Task tab a task's dot says its state, and who holds it while it's claimed (`claimed by claude`).

A task is the words typed and its attachments. The rest is labels: `deictic.project`, `deictic.at` (the element's
`file:line:column`), `deictic.file`, `deictic.url`, `deictic.viewport` and more, with your own beside them. After the
words comes what a label can't hold: the chain of source it rendered through, as
`src/ui/label.tsx:6 ← Field (src/Field.tsx:20) ← Panel` (a shared component's line is the same wherever it's
used; the rest say where: with React in development the components that use it, three at most, and otherwise the
files around it). The element's HTML as it rendered is attached as `element.html`,
masked as screenshots are, for whoever can't open the page as you had it: a file, so the task stays short.
Untick **Attach HTML snapshot** for a task without it; `html: false` takes the box away. A screenshot attached by the box has the element outlined in it; one you annotated is as you drew it.

The tab lists the element's tasks, then the rest of its file's, folded away: each with its tag and line, which opens
that element's tasks when it's on the page. A task stays with its element as lines above it change, while the opening
tag's first line is still the same and the file has it once.

In the Task tab:

- **Attach** adds a screenshot of the page, and **Annotate** opens it to draw boxes, arrows and notes on.
- **Attach HTML snapshot** adds the element as the page has it, as a file.
- **Record** records the page as you use it, drawing as you go, with the mic on if you like. A reload, or a link to
  another page of your site, leaves it going: stop it there, and the Task tab comes back with it, about the element
  you started on, whether that page has it or not.
- **Voice** records a note.
- The tasks already about the element are listed. An ID opens the task on the board, and a task no one has claimed
  can be edited or deleted. Undo takes any of it back.
- Beside the channel it says who's watching it, `claude watching`, or `no agent watching`: whether a task you add
  now is taken up. It knows of an agent watching with the skill from the project's folder, and of one holding a
  claim on a task of the channel's; with a board that isn't this machine's own it says nothing where it knows of
  none, as one may watch from elsewhere.

### The agent skill

deictic ships a skill that watches the channel and works each task as it arrives. What it runs is the package's own
`deictic` command, so it reads tasks and recordings with the version that wrote them: `deictic watch`, `deictic task`,
`deictic recording` (a timeline), `deictic frame` (a screenshot at any moment), `deictic voice` and
`deictic transcribe`, and `deictic vb`, the board's CLI on the dev server's board (`npx deictic --help` lists them).
Its watch ends once the channel has been quiet for 20 minutes, and the agent then stops and says so, so none watches
for ever. `init` offers to add it; otherwise `npx skills add gkurt/deictic`.

## Screenshots, recordings and voice

| Plugin                | Options                                           |
| --------------------- | ------------------------------------------------- |
| `deictic/screenshots` | `renderer`, `keep` (100), `dir`, masking          |
| `deictic/annotations` | `color`, `shortcut`                               |
| `deictic/recordings`  | `keep` (20), `dir`, `canvas`, masking             |
| `deictic/voice`       | `keep` (50), `dir`                                |
| `deictic/logs`        | `levels`                                          |
| `deictic/network`     | `headers`, `body`, `mask`, `ignore`, `initiators` |

`init` installs what they use. Where something's missing (`modern-screenshot`, for `dom()` below), the dev server
says so as it starts, with the command that installs it.

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

A recording has what a `<canvas>` drew, as a picture of each canvas that changed, twice a second:
`recordings: { canvas: { fps: 4 } }` for more, `canvas: false` for none (it then replays blank).

With logs and network, a recording has more than the page, each at its moment. The replay lists them beside the
page: the row it's at is lit, a click on one goes to its moment and shows the rest of it, and each error and failed
request is a mark on the timeline. Both are rrweb's own plugins, which
listen only while a recording is going, and each is left out with `false`.

- **`logs`** keeps what the page logged and the errors nothing caught. `levels: ['warn', 'error']` keeps less. rrweb
  wraps the console as a recording starts and puts it back as it stops, so the rest of the time the browser's tools
  name your own code as each line's source. Nothing masks what your code logs.
- **`network`** keeps the page's `fetch` and XHR requests: the URL, the status and the timing, as the browser reports
  them of itself, with nothing wrapped. `headers: true` and `body: true` add those and the method, for which rrweb
  wraps `fetch` and `XMLHttpRequest` while a recording is going. `initiators` adds what the page loads (`'img'`,
  `'script'`).

Requests are masked before they're kept. A value is blanked to `***` where its name says it's a secret (`token`,
`secret`, `password`, `auth`, `cookie`, `session`, `key`, `code` and the like), in a URL's query or fragment, a header,
and a body's fields where the body is JSON or a form; `mask: ['email']` adds names. A password before a URL's host is
dropped, a body is cut at 10,000 characters, and `ignore: ['/analytics']` leaves requests out whole. A secret under a
name that says nothing isn't found, which is why headers and bodies are kept only when asked for.

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

What a plugin's routes would keep, the module keeps, and answers with the `url` it's at: screenshots' `add`; voice's
`add` and then `more/<id>`, a take as it's spoken (the `url` with `?last`); recordings' `begin`, `part/<id>?seq=<n>`
and `end/<id>` (the `url`) or `discard/<id>`. A recording's is a replay page for the build to publish:
`replayPage({ player, source })`, from `deictic/recordings`, is its HTML.

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
- `packages` names what it imports that the project installs itself (its optional peers): as the dev server starts,
  one that's missing is said, with the command that installs it.
- `setup` answers an API for other plugins, which reach it with `context.use(name)`. That's how tasks attaches
  screenshots and recordings.
- A change that isn't to a file answers `{ done: record }`, and the plugin's `undo` and `redo` get the record back.
- Throw a `Refusal` for an op the plugin won't make. The panel shows its message.
- `read` and `apply` get the element's source, or a `Refusal` saying why it isn't to be found (the file doesn't parse,
  or the page runs other code than the file has): throw it where the plugin needs the source, or go on without, as
  tasks do. Text edits without it are refused.
- A panel leaves the popup for something on the page with `away(state, task)`, and is mounted again with `resumed`.
  Where the task outlasts a page load, as a recording does, the page half's `resume` answers it on the next page, and
  the popup comes back there: on the element, or without it (`element.isConnected` is false) where that page has none.

The types in `deictic`'s index document each part.

## How it works

- A transform that runs before the framework's own adds `data-deictic="src/App.tsx:12:5"` to every host element
  (`div`, `button`) in `.jsx`, `.tsx` and `.js` modules and in `.astro` components. So it works for any framework
  that compiles JSX, server components too, and points at the element's own tag, not the component around it.
- Its endpoints are on the dev server's own origin, `/__deictic/*`, and take writes only as same-origin JSON, so no
  other site can make them and no token reaches the page.
- Every change goes into one history in `.deictic/history.json`. The popup's undo and redo walk the part of it that
  is the open tab's on the element it's open on. A plugin's own change, a task, is undone by the plugin.
