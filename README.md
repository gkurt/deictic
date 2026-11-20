# deictic

Point at an element in your running app and leave a task about it, for you, a teammate or an agent to work.

Hold **Alt** and point: the element is outlined with its tag and the file and line that rendered it. **Alt-click**,
say what should change, and attach a screenshot to draw on, a screen recording or a voice note. The task goes to a
[Vercel Board](https://vercel.com/docs/board) with everything an agent needs to find the code: the element's
`file:line:column`, the page and the viewport.

It runs in your dev server only. A production build has none of it.

## Install

```bash
npm install -D deictic @vercel/board rrweb rrweb-player rrweb-snapshot playwright-core
```

Then add it to your bundler. `recommended()` is the plugins for tasks: tasks, screenshots, annotations, recordings
and voice.

```ts
// vite.config.ts (and anything on Vite: React Router, TanStack Start…)
import { recommended } from 'deictic/recommended';
import { deictic } from 'deictic/vite';

export default defineConfig({
  plugins: [react(), deictic({ plugins: recommended() })],
});
```

| Bundler                         | Setup                                                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js (`next dev`)            | `export default withDeictic(nextConfig, { plugins: recommended() })`, from `deictic/next`                                                           |
| webpack 5, Rspack               | `plugins: [new DeicticPlugin({ plugins: recommended() })]`, from `deictic/webpack` (`launch-editor` to open files)                                  |
| Astro                           | `integrations: [deictic({ plugins: recommended() })]`, from `deictic/astro`                                                                         |
| Bun (`Bun.serve`, HTML imports) | `deictic({ plugins: recommended() })` from `deictic/bun`, named in `bunfig.toml`'s `[serve.static] plugins`, its `routes` spread into `Bun.serve`'s |

Screenshots render in a Chromium: Playwright's (`npx playwright install chromium`), else Chrome or Edge. React
Native isn't supported: there's no DOM to point at.

## Tasks

Tasks go to a board on your machine or your team's:

```bash
npx vb serve                                   # a board on this machine, kept in .board/
BOARD_URL=http://127.0.0.1:4100/api/board vite # or no BOARD_URL for your team's board, after `vercel login`
```

Whoever works the channel (`deictic` by default) takes it from there. For an agent, deictic comes with a skill that
watches the channel and works each task as it arrives, with scripts that read a task, turn a recording into a
timeline, screenshot it at any moment, and transcribe its voice notes:

```bash
npx skills add ./node_modules/deictic
```

In the Task tab, **Attach** adds a screenshot of the page, **Annotate** opens it to draw boxes, arrows and notes on,
**Record** records the page as you use it (drawing as you go, with the mic on if you like), and **Voice** records a
note. Each is a chip that opens in a lightbox. The panel lists the tasks already about the element, and undo
cancels a task no one has claimed yet. The page hears of each task added as a `deictic:task` event on `window`, its `detail` the task's ID,
title, element and what was attached.

## Options

Each plugin takes its options under its name, and `false` leaves one out. Other plugins, your own included, go
beside the preset:

```ts
deictic({
  shortcut: { modifiers: ['Control', 'Shift'] }, // instead of Alt; `false` for none
  plugins: recommended({
    tasks: { channel: 'ui', labels: { team: 'web' } },
    screenshots: { maskAllInputs: true },
    voice: false,
  }),
});
```

Screenshots and recordings hide what [rrweb](https://github.com/rrweb-io/rrweb) would, by its names: `rr-block`
blanks an element, `rr-mask` masks its text, `maskAllInputs` masks every field (passwords always are). Nothing of
deictic's own UI is in them. What a project keeps (the history, shots, recordings, voice notes) is in `.deictic/`,
which ignores itself in git.

## How it works

- A transform that runs before the framework's own adds `data-deictic="src/App.tsx:12:5"` to every host element
  (`div`, `button`), so it works for any framework that compiles JSX, server components too, and points at the
  element's own tag rather than the component around it.
- Its endpoints are on the dev server's own origin, `/__deictic/*`, and take writes only as same-origin JSON, so no
  other site can make them and no token reaches the page.
- Every change goes into one history in `.deictic/history.json`, which undo and redo walk. A plugin's own change, a
  task, is undone by the plugin.

## Writing a plugin

A plugin has a server half, which runs beside the bundler, and a page half, which can draw a tab in the popup.
Every part is optional but its `name`.

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

Plugins add routes to the dev server (`routes`), set up an API for others (`setup`), and reach each other's with
`context.use(name)`: that's how tasks attaches screenshots and recordings. A change that isn't to a file answers
`{ done: record }`, and the plugin's `undo` and `redo` get the record back. The types in `deictic`'s index document
each part.

## Develop

```bash
bun install
bun dev          # build, then the site on http://localhost:5180, with a board on this machine for its tasks
bun run test     # bun test, on the source
bun run checks   # lint + format check + type check + test
```

`examples/` has the same page on Vite, Next, Rspack and Bun (`bun run dev` in each, after a build). `/internal/` on
the site pins deictic's own popup open at each tab, to leave tasks about deictic itself.
