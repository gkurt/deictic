# deictic

Point at an element in your running app and edit what made it. Changes are written to your source
files and can be undone.

Hold **Alt** and point: the element is outlined with its tag, its file and line, and how many
elements on the page come from the same place in the source. **Alt-click** to open the popup, with a
tab for each plugin. With the recommended plugins, say in the Task tab what should change, attach a
screenshot to draw on, a screen recording or a voice note, and it goes to a [Vercel Board](https://vercel.com/docs/board)
for you, a teammate or an agent to work. Or make the change yourself: with the [Tailwind](#what-the-tailwind-plugin-edits)
plugin, add or remove classes and they preview on every one of those elements, then **Save** writes them to the
`className` in your file. **↶** and **↷** undo and redo, across every change deictic made.

deictic itself is the glue: the transform that ties each element to its source, the dev server's
endpoints, the history, shortcuts and the popup. What you can do comes from plugins, every one of
them optional: [Tailwind](#what-the-tailwind-plugin-edits) edits classes, and
[tasks](#tasks-on-a-vercel-board) adds a task about an element to a Vercel Board. Plugins can add
routes to the dev server and use each other, so screenshots, annotations and recordings can come as
plugins that others build on (see [Writing a plugin](#writing-a-plugin)).

## Install

```bash
npm install -D deictic @vercel/board rrweb rrweb-player rrweb-snapshot playwright-core
```

`recommended()` is the plugins for tasks: [tasks](#tasks-on-a-vercel-board), [screenshots](#screenshots),
[annotations](#annotations), [recordings](#recordings) and [voice](#voice), and the packages beside deictic
are theirs. Screenshots render in a Chromium: Playwright's (`npx playwright install chromium`), else Chrome or
Edge. Tasks go to a board: `npx vb serve` runs one on your machine (see [Tasks](#tasks-on-a-vercel-board)).

Then add it to your bundler. Every integration takes the same options (`plugins`, `shortcut`), runs in
the dev server only (a build includes none of it), and loads nothing with no plugins.

**Vite** (and anything built on it: React Router, TanStack Start, SvelteKit with JSX…):

```ts
// vite.config.ts
import { recommended } from 'deictic/recommended';
import { deictic } from 'deictic/vite';

export default defineConfig({
  plugins: [react(), deictic({ plugins: recommended() })],
});
```

**Next.js** (Turbopack, `next dev`): server components are marked too.

```ts
// next.config.ts
import { withDeictic } from 'deictic/next';
import { recommended } from 'deictic/recommended';

export default withDeictic(nextConfig, { plugins: recommended() });
```

**webpack 5 and Rspack** (with their dev servers):

```ts
// webpack.config.ts or rspack.config.ts
import { recommended } from 'deictic/recommended';
import { DeicticPlugin } from 'deictic/webpack';

export default { mode: 'development', plugins: [new DeicticPlugin({ plugins: recommended() })] };
```

Opening a file in the editor needs `launch-editor` installed. Where the dev server is started by hand,
mount the plugin's `middleware`.

**Bun** (`Bun.serve` with HTML imports): the plugin is named in `bunfig.toml`, and its routes go in the
server's.

```ts
// deictic.plugin.ts
import { deictic } from 'deictic/bun';
export default deictic({ plugins: recommended() });

// server.ts
import tools from './deictic.plugin.ts';
Bun.serve({ routes: { ...tools.routes, '/*': index }, development: true });
```

```toml
# bunfig.toml
[serve.static]
plugins = ["./deictic.plugin.ts"]
```

**Astro**: `integrations: [deictic({ plugins: recommended() })]`, from `deictic/astro`.

Each plugin takes its options under its name, and `false` leaves one out:
`recommended({ tasks: { channel: 'ui' }, voice: false })`. Any other plugin goes beside them, the preset spread
into a list with it (`[...recommended(), …]`), as the [Tailwind](#what-the-tailwind-plugin-edits) plugin from
`deictic/tailwind` does to edit classes in place.

React Native (Metro) isn't supported: there is no DOM to point at. Outside Vite, the module that starts
the overlay is written to `.deictic/client.js` as the dev server starts, as those bundlers have no
virtual modules.

## Shortcuts

One shortcut opens everything: **Alt-click** opens the popup on the element, with a tab for each plugin
that has a panel, at the tab you used last. Give it other keys where Alt is taken, or turn it off. A
plugin can also have a shortcut of its own, none by default, which opens the popup at its tab:

```ts
deictic({
  shortcut: { modifiers: ['Control', 'Shift'] }, // or `false`, leaving only plugins' own
  plugins: recommended({
    tasks: { shortcut: { modifiers: ['Alt'], button: 'right' } },
    annotations: { shortcut: { modifiers: ['Alt', 'Shift'] } },
  }),
});
```

`modifiers` are held, and no others, to outline the element under the pointer (`'Alt'`, `'Control'`,
`'Meta'`, `'Shift'`), and `button` is pressed with them to open the popup (`'left'`, `'middle'`,
`'right'`; `'left'` unset). Exactly those keys, so AltGr, which is Control and Alt, isn't Alt. Two
shortcuts may share keys with different buttons. A shortcut with no modifiers, an unknown key, or two
alike (deictic's own among them) stop the dev server as it starts, saying what to write instead.

## What the Tailwind plugin edits

It isn't in the preset: add `tailwind()` from `deictic/tailwind` beside it, and its tab edits an element's
classes in place, with no task needed.

| In the source                             | In the panel                                       |
| ----------------------------------------- | -------------------------------------------------- |
| `className="p-2"`, `{'p-2'}`, ``{`p-2`}`` | Editable                                           |
| `cn('p-2', on && 'ring')`                 | First argument editable, the rest shown as runtime |
| no `className`                            | Editable; saving adds the attribute                |
| ``{`p-${n}`}``, `{styles.box}`            | Shown only: there's no single list to edit         |

The class helpers it recognizes are `cn`, `clsx`, `cx`, `twMerge` and `classNames`. Change them
with `tailwind({ helpers: [...] })`.

A class that no file used before has no CSS until Tailwind sees it on disk. It shows in the preview
only after you save.

## Tasks on a Vercel Board

For a change you'd rather describe than make: open the Task tab on an element, say what should change,
and **Add task** (or Ctrl+Enter) adds it to a [Vercel Board](https://vercel.com/docs/board). Whoever
works that board's tasks takes it from there: you, a teammate, or an agent of your own claiming them
with `vb tasks claim --ready deictic`. deictic only adds the tasks.

For an agent, deictic comes with a skill: it watches the channel and works each task as it arrives, with
scripts that read a task, turn a recording into a timeline, screenshot it at any moment, and find what
was said in its voice clips and when (with Whisper on your machine, which the agent asks before setting up).

```bash
npx skills add ./node_modules/deictic
```

```bash
npx vb serve                                   # a board on this machine, kept in .board/
BOARD_URL=http://127.0.0.1:4100/api/board vite # or leave BOARD_URL out for your team's board, through `vercel login`
```

```ts
deictic({ plugins: recommended({ tasks: { channel: 'ui', labels: { kind: 'ui' } } }) });
```

A task's text is what you typed, then where: the element's `file:line:column` and tag, the page's
URL and viewport, its opening tag as the source writes it, and its HTML as it rendered. It is
labeled `deictic.at=<file:line:column>` and `deictic.page=<path>`, and the panel lists the
tasks about the element you clicked with their state, until its line moves. The channel's name links
to its page on a board `vb serve` runs; for another board, pass `link: (channel) => url`. Pass `board` to use a
board of your own making, as `board({ name: 'qa' })` from `@vercel/board` answers it.

Undo cancels the task while no one has claimed it; redo adds it again, as a new task.

With the [screenshots](#screenshots) plugin loaded too, the panel offers **Attach a screenshot**,
ticked: the task gets a PNG of what the page shows, and its text says where the element is in it.

With [annotations](#annotations) loaded as well, **Annotate** beside it takes the shot now and opens it
over the page to draw on, with the same tools as annotate mode. Save it and it's a chip under the field:
click it to see it in the lightbox (and **Change marks** there), **Add another** for one more shot, **×** to remove one. Removing the
last goes back to the box, unticked. The task gets each shot with its marks drawn in, and its text says
how many marks are on which and what the notes say.

## Screenshots

`screenshots()` has no panel: it takes shots for other plugins, as the tasks plugin attaches them. A shot
is the viewport, or with `{ area: 'element' }` the element alone. Nothing of deictic's is in it, not
its panels and not an outline: the shot says where the element is instead, and a task's text repeats it.
Shots are kept in `.deictic/screenshots`, the latest 100 (`keep`).

How a shot is made is its renderer's:

| Renderer               | How                                                                                                                               | Needs                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `rrweb()`, the default | Snapshots the page's DOM with rrweb and renders it in a browser beside the dev server. Text lays out as the page's does.          | `rrweb-snapshot`, `playwright-core` |
| `dom()`                | Draws the page in the page itself, from its DOM. For a target with no server to render on; text may lay out a little differently. | `modern-screenshot`                 |

```ts
import { dom } from 'deictic/screenshots';

deictic({ plugins: recommended({ screenshots: { maskAllInputs: true } }) });
// In a page with no server to render on (and `modern-screenshot` installed):
recommended({ screenshots: { renderer: dom() } });
```

`rrweb()` renders in any Chromium: Playwright's own when installed (`npx playwright install chromium`),
then Chrome, then Edge, or the one `rrweb({ executablePath })` or `rrweb({ channel })` names. It's launched
on the first shot and kept for the next, so a shot takes a fraction of a second after that. What a
snapshot doesn't carry it can't show: a canvas's drawing, a cross-origin iframe, or an image the dev
server's browser can't load without the page's cookies.

Both hide what [rrweb](https://github.com/rrweb-io/rrweb) would, by rrweb's names and defaults, so one
marking hides the same things from a screenshot as from an rrweb recording:

| Option             | Default    | In the shot                                         |
| ------------------ | ---------- | --------------------------------------------------- |
| `blockClass`       | `rr-block` | The element is an empty box its size                |
| `blockSelector`    |            | The same, by selector                               |
| `maskTextClass`    | `rr-mask`  | Its text keeps its spaces but shows `*`             |
| `maskTextSelector` |            | The same, by selector                               |
| `maskAllInputs`    | `false`    | Every field's value shows `*`; passwords' always do |

Only what's drawn changes, never the page. For a plugin of your own:

```ts
// In the page: the shot's ID, where the dev server serves it, and where the element is in it.
const shot = await context.use('screenshots')?.capture(context.element);
// A PNG made of it, with marks drawn over it say, kept as a shot of its own.
const marked = await context.use('screenshots')?.upload(png, shot);
// On the server: its PNG, to attach somewhere.
const png = context.use('screenshots')?.read(shot.id);
```

### Writing a renderer

A renderer is a page module and, where the page doesn't make the PNG itself, a `render` on the server.
Screen sharing, a browser's devtools or an extension can each be one.

```ts
// my-renderer/index.ts: what `screenshots({ renderer })` takes
export const shareScreen = (): Renderer => ({ client: 'my-renderer/client', clientOptions: { fps: 1 } });

// my-renderer/client.ts: the page half, which answers a body for the plugin's `add` route
import { boxOf, screenshotsClient } from 'deictic/screenshots/client';

export default screenshotsClient(async (element, { area, masking, renderer, overlay }) => ({
  body: await grabPng(), // a PNG; or JSON that the renderer's `render(input)` makes a PNG of
  type: 'image/png',
  box: boxOf(element, area),
}));
```

`overlay(area)` is the annotations over that part of the viewport, as an SVG that size, or `undefined`:
a renderer draws it over its shot, since deictic's own layers are left out.

## Annotations

`annotations()` marks up the page: its Annotate tab is annotate mode, with a box, an arrow, a pen and a
note. While it's open, a surface over the page takes the pointer, so drawing never clicks the page;
another tab, Done or Esc leaves it and the marks stay, per page, for the tab's session. "Remove last" and "Clear" take
them off.

```ts
deictic({ plugins: recommended({ annotations: { color: '#0ea5e9' } }) });
```

With screenshots loaded, a shot draws the marks over the page (from the same SVG the page shows), and a
task says how many there are and what the notes say. Marks are in page coordinates, so they stay on what
they point at as the page scrolls. Other plugins `use` them, a recording as much as a shot:

```ts
const marks = context.use('annotations');
marks?.list(); // every mark on this page: { id, color, shape, at }
marks?.add({ kind: 'box', x: 10, y: 40, width: 200, height: 24 });
const stop = marks?.subscribe((event) => record(event)); // { type: 'add', annotation } | { type: 'remove', id } | { type: 'clear' }
marks?.svg({ x: 0, y: 0, width: innerWidth, height: innerHeight }); // the marks over that part of the viewport

// A picture to draw on instead of the page, a shot most often: its marks, in its CSS pixels, or nothing if cancelled.
const picture = { url: shot.url, ...shot.size };
const drawn = await marks?.edit(picture, previous);
const png = drawn && (await marks?.flatten(picture, drawn)); // the picture with them drawn in
```

While the editor is open it holds Esc (`data-deictic-modal` on its root), so Esc leaves it, not the popup.

## Recordings

`recordings()` records the page with [rrweb](https://github.com/rrweb-io/rrweb). It has no tab: with tasks
loaded, **Record** beside Attach closes the popup and starts it. A toolbar shows on the page, with the
time, annotate mode's tools (a pointer to use the page, then box, arrow, pen and note), a mic with
[voice](#voice) loaded, **Stop** and **Discard**. Drag it by its grip to any edge of the window; it docks there, and starts there next time.
Stop brings the popup back on the element, with what you'd typed and attached, and the recording as a
chip that plays it back in the lightbox; like a drawn screenshot, it takes the place of the box. The task gets the recording as rrweb's events (JSON), and its text says how long
it ran and where it replays while the dev server keeps it.

rrweb records, and rrweb-player plays it back.

```ts
deictic({ plugins: recommended({ recordings: { maskAllInputs: true } }) });
```

It masks as screenshots do, by rrweb's names and defaults, and leaves out deictic's own UI. What's
drawn while recording is in it too, and the replay draws the marks where they were, but it's gone from
the page when the recording ends: the page's own annotations are only those made in the Annotate tab.
The replay shows the page in the colour scheme it was recorded in. Recordings are kept in
`.deictic/recordings`, the latest 20 (`keep`), and `/__deictic/plugins/recordings/replay/<id>`
plays one back in rrweb's player: a timeline with a marker at each change to the marks, speeds up to 8×,
skipping idle stretches, and fullscreen. `?t=4.2` opens it paused at that second, and `&bare` shows it
without the controls at the recorded size, for a screenshot. For a plugin of your own:

```ts
const recording = await context.use('recordings')?.record(); // { id, url, duration }, or nothing if discarded
```

## Voice

`voice()` records the mic, for other plugins: with tasks loaded, **Voice** beside Record records a voice
note right in the panel. It turns into the time, the mic's live waveform and a Stop; stopped, the note is a chip that plays it
in the lightbox, its waveform lit as it plays, and the task gets the audio. With recordings loaded too, the
recording toolbar has a mic, with its waveform beside it while it's on: turn it on and off as you go, and the
replay plays what it took in step with the page.

Every chip opens the same lightbox: shots, recordings (their replay, in a frame) and voice notes, ← and → between
them, growing out of the chip clicked and back into it on close.

The browser asks for the mic the first time, and lets it go between takes. Clips are what the browser's
`MediaRecorder` makes (WebM with Opus in Chrome and Firefox, MP4 in Safari), kept in
`.deictic/voice`, the latest 50 (`keep`). A page needs to be secure (https or localhost)
for the browser to give it the mic. For a plugin of your own:

```ts
const take = await context.use('voice')?.start(); // asks for the mic
const clip = await take?.stop(); // { id, url, duration, type }, kept by the dev server; or take.cancel()
```

## How it works

- **Element → source.** A transform that runs before the framework's own adds
  `data-deictic="src/App.tsx:12:5"` to every host element (`div`, `button`), not to components.
  Doing this at build time instead of reading React's fibers means it works for any framework that
  compiles JSX and for server components. It also points at the element's own tag rather than the
  component that rendered it.
- **Edits.** A plugin's server half reads the element from the parsed file (oxc) and turns an op
  from its panel into text edits. Plugins never write files: deictic does. That way every
  plugin's changes go into one history. A change that isn't to a file, such as a task, the plugin
  makes itself and records in the same history.
- **Endpoints.** `/__deictic/*` is served from the dev server's own origin. Writes must be
  same-origin JSON POSTs, so no other site can make them and no token needs to reach the page.
  Files outside the project root or inside `node_modules` are refused.
- **`.deictic/`.** What deictic keeps for a project lives in `.deictic/` at its root: the history,
  and the shots, recordings and voice clips plugins keep. It ignores itself in git (it holds a
  `.gitignore` of `*`), and survives a reinstall, as `node_modules` wouldn't.
- **Undo.** Each change stores the full text of each file before and after, in
  `.deictic/history.json`, so the history survives a restart. Undo only restores a
  file that is still exactly as deictic left it. If you've edited the file since, undo is refused
  and you use the editor's undo instead. A plugin's own change is undone by the plugin, which
  refuses on its own terms (a task someone has claimed).

## Writing a plugin

A plugin has a server half, which reads source and returns edits, and a client half, which draws
its panel. The two share a `Model` (what the panel shows) and an `Op` (what it asks for).

```ts
// my-plugin/index.ts: runs beside the bundler
import { definePlugin, Refusal, type Shortcut } from 'deictic';

export const title = (options: { shortcut?: Shortcut } = {}) =>
  definePlugin<{ title: string }, { title: string }>({
    name: 'title',
    client: 'my-plugin/client', // a module the page imports
    shortcut: options.shortcut, // opens its tab directly; leave it to the user, none by default
    read: ({ element, code }) => ({ title: /* find the attribute in element.attributes */ '' }),
    apply: ({ element }, target, op) => [{ start: element.name.end, end: element.name.end, text: ` title="${op.title}"` }],
  });
```

```ts
// my-plugin/client.ts: runs in the page
import { defineClientPlugin } from 'deictic';

export default defineClientPlugin<{ title: string }, { title: string }>({
  name: 'title',
  label: 'Title',
  mount(panel, { model, elements, apply }) {
    // draw into `panel`; `apply(op)` writes and returns the model read again
    // return a function that undoes any preview on the page
  },
});
```

```ts
deictic({ plugins: [...recommended(), title()] });
```

A panel draws in the overlay's shadow root, styled by its custom properties (`--deictic-accent`, `--deictic-bg`…).
Give a control a `title` as anywhere: the overlay shows it in a tooltip of its own, soon after the pointer rests or
keyboard focus lands, and a control with no text of its own is named by it.

An edit can target another file (`{ file: 'src/locales/en.json', ... }`), and `source.read(file)`
reads one. That's what lets an i18n plugin edit a locale file from a click on its text.

`read` and `apply` may be async. A change that isn't to a file the plugin makes in `apply` itself,
and answers `{ done: record }` instead of edits. The history keeps the record (JSON, as it's kept on
disk) and hands it to the plugin's `undo` and `redo`; `redo` answers the record the next undo needs.

```ts
definePlugin<Model, Op, { id: string }>({
  // …
  apply: async (source, target, op) => ({ done: { id: await api.create(op) } }),
  undo: ({ id }) => api.remove(id), // throw a Refusal when it can't any more
  redo: async ({ id }) => ({ id: await api.restore(id) }),
});
```

### Plugins without a panel, and plugins that use each other

Every part of a plugin is optional. One whose page half has no `mount` has no tab in the popup: it may only set up an API
for the others, add routes to the dev server, or run in the page from load (a recording).

- `setup(context)` runs once on each side, the server's as the dev server starts and before it
  answers anything, the page's as the page loads. What it answers is the plugin's API there.
- `context.use(name)` reaches another plugin's API on the same side, or nothing when it isn't
  loaded. Call it when you need it, not in `setup`, where the other may not be set up yet.
- `needs: ['screenshots']` names plugins it can't do without: the dev server won't start without them.
  Anything else it uses is optional, so check what `use` answers.
- `routes` mount at `/__deictic/plugins/<name>/<route>`, and below it, over `Request` and
  `Response`. A `GET` must change nothing; anything else reaches the route only from the page itself.
  In the page, `context.request(route, init)` asks the plugin's own routes.
- The page's context also has `root`, deictic's shadow root, for anything a plugin draws outside
  its panel, and `open(plugin, element)`, which opens the popup at that plugin's tab on an element.
- A panel can leave the popup to do something on the page and come back: `context.away(state, task)`
  closes it, runs `task`, and opens it again at the same tab on the same element. The new mount gets
  `context.resumed`, holding the `state` kept (what was typed, what's attached) and what `task` answered,
  or its `problem`. That's how tasks records the page and comes back with the recording:

```ts
record.onclick = () => context.away({ text: field.value }, () => context.use('recordings')!.record());
// …and as the panel mounts:
if (context.resumed) field.value = (context.resumed.state as { text: string }).text;
```

- An element marked `data-deictic-modal` in the root takes Esc from the popup while it's there, as
  the screenshot editor does.

```ts
// screenshots/index.ts: the server half keeps what the page sends, for other plugins to attach
export const screenshots = () =>
  definePlugin<never, never, never, Shots>({
    name: 'screenshots',
    client: 'screenshots/client',
    setup: () => new Shots(),
    routes: {
      add: async (req, { use }) => Response.json({ id: use('screenshots')!.add(await req.blob()) }),
    },
  });

// screenshots/client.ts: the page half captures, for other plugins' panels
export default defineClientPlugin<never, never, Capture>({
  name: 'screenshots',
  setup: ({ request }) => ({
    capture: async (element) => (await (await request('add', { method: 'POST', body: await shoot(element) })).json()).id,
  }),
});

// In another plugin's panel: attach one when the screenshots plugin is there.
const id = await context.use('screenshots')?.capture(context.element);
```

A plugin's package declares its APIs, so `use` knows their types:

```ts
declare module 'deictic' {
  interface ServerApis {
    screenshots: Shots;
  }
  interface ClientApis {
    screenshots: Capture;
  }
}
```

## Status

Working: Vite, Next.js (Turbopack), webpack, Rspack, Bun and Astro; the Tailwind, tasks, screenshots,
annotations, recordings and voice plugins; undo and redo. Planned, roughly in order:

- **Plugins**: JSX text, literal props at a component's call site (through React's owner stack,
  e.g. bippy), translations, and images.
- **Tailwind**: autocomplete and a live preview of new classes, from Tailwind's design system on
  the server.
- **History**: a three-way merge instead of refusing an undo after an editor edit, and optional
  checkpoints on a hidden git ref.

## Develop

```bash
bun install
bun dev          # build, then the site: the homepage at / and a playground at /example/,
                 # on http://localhost:5180, with a board on this machine for its tasks
bun run test     # bun test, on the source
bun run checks   # lint + format check + typecheck + test
bun run example  # build, then the Vite + React + Tailwind example
```

`examples/next`, `examples/rspack` and `examples/bun` run the same page on the other integrations
(`bun run dev` in each, after a build).

`/internal/` on the site shows deictic's own popup pinned open at each tab, to point at and leave tasks about
deictic itself. Pointing reaches inside open shadow roots: the outline is on the marked element around what's
under the pointer, a dashed one on what is, and a task names that part's path and HTML. `popupIn(container,
{ tab, element })` from `deictic/client` pins the popup in a page of your own the same way.
