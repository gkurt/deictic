# AGENTS.md

Guidance for AI agents working in this repository.

## Commands

```bash
bun dev          # build, then the site (site/): homepage at /, playground at /example/, port 5180
bun run test     # All tests (with the deictic@dev condition: source, not dist)
bun check        # Type check (Bun's built-in checker, same errors as TypeScript 7 tsc), over src and test
bun fmt          # Format (Bun's built-in formatter, config in bunfig.toml)
bun run lint     # oxlint + format check
bun run fix      # lint autofix + format
bun run checks   # lint + type check + test
bun run build    # dist/ with tsdown
bun run example  # build, then the Vite example's dev server
bun run tegami   # write a changelog entry (.tegami/<slug>.md)
```

`bun check` and `bun fmt` are Bun built-ins, not scripts: never add a `check` or `fmt` script, it would shadow
them. Before finishing, run `bun run fix` then `bun run checks`. Fix the code; don't disable rules.

## Structure

One package, ESM-only. deictic is the glue and every plugin is optional: the core never imports
one (`src/plugins/` are subpath exports a user adds). Two halves that share only types (`src/index.ts`): code for the browser, which
must stay small and dependency-free, and the tools, which run beside the bundler in Node or Bun.

- `src/index.ts`: the plugin API, every part optional but `name`. `ServerPlugin` (`client`, `clientOptions` → the page's `context.options`, `shortcut`,
  `needs`, `setup` → its API, `routes`, `read`, `apply` → `TextEdit[]` or `Done`, `undo`, `redo`,
  `describe`; any of them may be async) and `ClientPlugin` (`label`, `setup` → its API, `mount`), tied by
  `name`, sharing a `Model` and an `Op`. `ServerContext`/`ClientContext` carry `use(name)`, another
  plugin's API on the same side, typed through the `ServerApis`/`ClientApis` interfaces plugins merge
  into; the page's also `root` (the overlay's shadow root), `request(route)` to the plugin's routes, and
  `open(plugin, element)` to open the popup at a tab. A panel's context has `away(state, task)`: close, run
  `task`, reopen at the same tab and element with `resumed` (`state`, and `task`'s `result` or `problem`). `Refusal` is an op
  a plugin won't make, its message the fix; the endpoints answer it with 422 and the panel shows it.
  `Done` (`{ done: record }`) is a change the plugin made itself, not to a file: the history keeps the
  record, JSON, and hands it to the plugin's `undo` and `redo`. The parser is imported for its types only.
- `src/shortcut.ts`: a `Shortcut` (`modifiers` held exactly, `button`), shared by both halves. deictic's
  own (`deictic({ shortcut })`, `MASTER` Alt by default, `false` for none) opens the popup at the tab
  used last; a plugin's (its factory's `shortcut` option, none by default) at its tab. `checkShortcuts`
  orders and checks them, deictic's first as `OWN`, refusing two alike: integrations call it as they
  start, so a wrong one fails the dev server. `gestureOf` is what the overlay tests events with.
- `src/tools/plugins.ts`: `checkPlugins(plugins, own)` (names lowercase and unique, `needs` loaded, a
  shortcut only with a `client`, shortcuts with deictic's own) as an integration starts; `setUp` runs every server `setup` at once and
  answers the shared context, whose `use` reads lazily.
- `src/tools/locate.ts`: the transform. Marks host elements (lowercase JSX tags) with
  `data-deictic="file:line:column"`, where the opening tag's `<` is, in UTF-16 columns from 1.
  Must see the source as written, so integrations run it first. `lineStarts`, `position`, `offsetOf`.
- `src/tools/source.ts`: `sourceAt`, a target's file parsed and its opening tag found by offset and
  tag (a `Refusal` saying to reload when the file moved on); `resolveFile`, which refuses anything
  outside the root or under `node_modules`; `applyEdits`, the edits as each file's new text.
- `src/tools/kept.ts`: `keptIn(root, …parts)`, a path under the project's `.deictic/`, made with a
  `.gitignore` of `*` the first time. Every default data path goes through it.
- `src/tools/history.ts`: every change as each file's whole text before and after, or as a plugin's
  name and record, in `.deictic/history.json`. Undo and redo refuse when a file isn't
  as the change left it, and call the plugin for its own (refusing when it isn't loaded). A redone
  record is replaced by what `redo` answers, and an undone one by what `undo` does, where it answers one. A new change drops the redo stack.
- `src/tools/endpoints.ts`: `/__deictic/{read,apply,undo,redo}` (same-origin JSON POSTs only),
  `history` and `open` (GET), and each plugin's `routes` under `plugins/<name>/<route>` (anything but
  GET and HEAD from the page's origin only, in any content type), over `Request` and `Response`;
  `nodeMiddleware` mounts them on Vite. Every request waits for the plugins' setups. A plugin without
  `read` reads `null` and isn't checked against the source; one without `apply` refuses ops.
  Writes run one at a time, since a plugin's own change may wait on the network.
- `src/vite.ts`: `enforce: 'pre'` and its transform `order: 'pre'` (before the React Compiler, also `pre`, compiles the JSX away), `apply: 'serve'`. In the browser each marked module appends
  `import "virtual:deictic/client"`, which starts the overlay with deictic's own shortcut and each plugin that
  has a `client`, and its checked shortcut where it has one. No plugins by default.
  `open` redirects to Vite's `/__open-in-editor`.
- `src/tools/integration.ts`: what every integration shares: `prepare` (checks plugins and shortcuts as
  it starts), `clientModule` (the code that starts the overlay), `writeClient` (that code as
  `.deictic/client.js`, beside a `package.json` with `sideEffects: true` so no bundler drops it, for
  bundlers without virtual modules), `mark` (the transform, for project files only) and `importOf` (the
  client's import, relative to the module: Turbopack can't import a Windows path). `editor.ts` opens a
  place with `launch-editor`, an optional peer.
- `src/loader.ts`: the webpack-style loader (`{ root, client? }`, JSON options) that `webpack.ts` and
  `next.ts` use: marks, and appends the client's import where `client` is given (the browser's build).
- `src/webpack.ts`: `DeicticPlugin` for webpack 5 and Rspack, development mode only: the loader as a `pre`
  rule, the endpoints first in `devServer.setupMiddlewares` (browser targets only), or `middleware`.
- `src/next.ts`: `withDeictic(config, options)`, dev only: Turbopack rules for `*.tsx`/`*.jsx` (browser
  with the client, the server without, neither for `foreign` code), the endpoints on a port of their own
  behind a `beforeFiles` rewrite, `open` redirecting to Next's `__nextjs_launch-editor`. Next loads its
  config with `require`, so the package's exports use `default`, not `import`.
- `src/bun.ts`: a `[serve.static]` plugin (`onLoad`, skipped in `Bun.build`) whose `routes` the server spreads
  into `Bun.serve`'s; `open` is `Bun.openInEditor`.
- `src/astro.ts`: the Vite plugin, and `injectScript('page', …)` of its client, in dev.
- `src/client/lightbox.ts`: `openLightbox(root, items, { at, from })`, offered to panels as `context.lightbox`: an
  `image`, a `page` (an iframe) or an `audio` item (a player: play, the clip's waveform lit as it plays, seek by
  clicking or dragging it, the time), big over everything, ← → between items, each item's `actions` beside its
  title. It grows out of `from` and back into it (the Web Animations API; a fade where motion is reduced), and is
  a `data-deictic-modal`, so Esc is its. `pinned` draws it in place (`lightboxIn`, for `/internal/`): no backdrop,
  close, keys or autoplay.
- `src/client/waveform.ts`: `peaksOf(url, bars)` (RMS per bar, and the length, as webm doesn't say), `drawBars`,
  and `liveWaveform(canvas, stream, colors)` (an `AnalyserNode` on the mic, bars scrolling in); exported from
  `deictic/client` for plugins.
- `src/client/tooltip.ts`: `tooltips(root)`, the one tooltip for a shadow root of ours (the overlay's, and
  `popupIn`'s): any `title` in it moves to `data-tip` on first hover (the browser's own never shows), naming a
  textless control (`aria-label`) or describing one with text (`aria-description`). Fixed in the root, centred
  under the control, kept on screen. Set `title`, never draw a tooltip of a panel's own.
- `src/client/index.ts`: the overlay, in one shadow root (`style.ts`). Runs each page half's `setup`
  first (a failing one is logged, the rest go on). Each plugin with a `mount` is a tab in the popup.
  Outlines the marked element under the pointer while a shortcut's keys are held, and opens the popup on
  its button (`click`, `auxclick` or `contextmenu`, the first of them per press): deictic's own at the
  tab used last (`localStorage` `deictic:tab`), a plugin's at its tab. The popup's head is the tabs and
  close, then open-in-editor (an arrow out, and an "Open in editor" tooltip), undo and redo (off when `history` has nothing to take back or do again, titled with the change they would; read on open, after a change, and on pointerenter); a tab reads its model when shown (a read another overtook
  mounts nothing), and after an undo or redo it remounts with the model read again. While an element marked
  `data-deictic-modal` is in the root, Esc is that modal's, not the popup's. Pointing goes down through open
  shadow roots (not the overlay's): the target is the nearest marked element around what's under the pointer,
  out through hosts, and what's under it, where it differs, is dashed and given to the panel as `pointed`
  (a task names its path and HTML). `openPopup(element, { tab })` opens it over the page as deictic's shortcut does, for a page's own gesture (the
  homepage demo's plain click). `popupIn(container, { tab, element })` shows the real popup pinned in a
  page (its own shadow root, `.panel.pinned`, no Esc, reopened when closed, the last tab left alone).
- `src/plugins/tailwind/`: `index.ts`, the server half (where a class list sits: `spotOf`), and
  `client.ts`, the chip panel. Previews per element, keeping each one's runtime classes, and puts
  the page back on close only for an unsaved preview, so it never races the bundler's update.
- `src/plugins/screenshots/`: no panel. `index.ts`, the server half: keeps the latest `keep` PNGs under
  `.deictic/screenshots` (IDs sort by time), answers `read(id)` to other plugins, and its `add`
  route takes a PNG, or JSON its renderer's `render` makes one of. A `Renderer` is a page module (`client`, which
  becomes the plugin's) and an optional `render`: `rrweb()` (default) and `dom()`. `client.ts` is
  `screenshotsClient(capture)`, the page half around a renderer's capture, which posts to `add` and answers the
  `Shot` with the element's `box`; nothing of deictic's is ever drawn. `dom.ts` draws in the page with
  `modern-screenshot`, masking the copy. `rrweb.ts` sends an `rrweb-snapshot` (masked by rrweb, the overlay cut
  out) with viewport, scroll and density; `playwright.ts` rebuilds it in a sandboxed iframe on a blank page of
  the page's origin (Playwright answers it) in a browser launched once (Playwright's Chromium, then Chrome, then
  Edge), and screenshots it. Masking options follow rrweb's names and defaults. Optional peers, each imported on
  first use. `test/rrweb.test.ts` compares a render with the live page by brightness (the iframe's text has no
  colour fringes) and skips without a browser.
- `src/plugins/annotations/`: marks on the page, page half only. `index.ts` is the types (`Shape`: box, arrow, pen,
  note, in page coordinates) and the factory (shortcut, `color`). `svg.ts` is `toSvg(annotations, area, scroll)`,
  shapes only (no `foreignObject`), the one drawing both the page's layer and a shot use. `client.ts`: `setup` keeps
  the marks per page in session storage, draws them in a layer of the overlay that lets the pointer through, and
  answers `list`, `add`, `remove`, `clear`, `subscribe` (for a recording), `svg(area)`, `edit(picture, marks)` (the
  same toolbar over a picture, in a modal over everything; marks in the picture's CSS pixels) `flatten` (its
  PNG with them drawn in) and `tools()` (the toolbar for another plugin's UI, with a pointer tool that leaves
  the page usable, drawing its own `marks`, kept by nothing and gone on `close`); `mount` is annotate mode, a toolbar and a surface over the page that takes the pointer.
  `draw.ts` is the toolbar and gestures both share, each saying where an event is in its marks' coordinates. Screenshots' renderers draw `svg(area)`
  over a shot (`overlay` in a `PageCapture`), and a task names the count and notes.
- `src/plugins/recordings/`: no tab. `index.ts`, the server half: keeps the latest `keep` recordings (JSON:
  `Kept`, rrweb's events with page, viewport and duration) under `.deictic/recordings`, answers
  `read(id)`, and routes `add`, `recording/<id>`, `replay/<id>` (`replay.ts`, `rrweb-player` sized to the window,
  restyled dark under `#main`, the marks drawn in its replayer's wrapper and moved with its scroll, a timeline
  marker per marks event, voice in step at its speed; `?t=`, `&bare`) and `player.js`/`player.css`
  (`rrweb-player`'s build, an optional peer).
  `client.ts`: `record()` imports rrweb, records with the overlay blocked and masking as screenshots', and
  shows the toolbar (`draggable`, docked to the nearest edge, kept in `localStorage`) with `annotations.tools()`;
  the marks go in as custom events (`MARKS`, in `marks.ts`), an SVG in page coordinates, at start and each change.
- `src/plugins/voice/`: no tab. `index.ts`, the server half: keeps the latest `keep` clips under
  `.deictic/voice` as the audio a `MediaRecorder` makes (webm, ogg, mp4, by extension), answers
  `read(id)`, routes `add` and `clip/<id>`. `client.ts`: `start()` asks for the mic and answers a `Take`, whose
  `stop` posts it and lets the mic go (`cancel` keeps nothing). The recording toolbar's mic (its live waveform beside it while on) makes a clip of each
  stretch it's on, at its offset (`Kept.voice`); the replay plays them in step and starts paused, as a browser
  plays sound only after a click.
- `src/plugins/recommended/`: `recommended(options)`, the preset the docs show: tasks, screenshots, annotations,
  recordings and voice, in their tabs' order, each with its options under its name or left out with `false`. Server
  halves only, like every factory. The README, homepage and skill show it. The README is short and about tasks: no class editing (Tailwind) in it.
- `src/plugins/tasks/`: adds a task about the element to a Vercel Board (`@vercel/board`, an optional
  peer, imported when first used). `index.ts` writes the task's text (what was typed, then only what no label
  holds: what's attached, and what was pointed at) and the facts as labels (`deictic.project`, from the `project` option
  or the root's `package.json`, `at`, `tag`, `line`, `page`, `url`, `viewport`, `count`, and `position` and `size` with one shot), under
  the user's own `labels`; the source and the rendered HTML aren't sent. `read` lists the element's tasks by that label, and the channel's page
  (`link`, or `/c/<channel>` beside a local board's `/api/board`, from `discovery()`), each task with its own
  (`?thread=<id>` there, or `link(channel, id)`), its whole typed text and whether it's `open`. Undo cancels the task
  unless it's past `ready`/`waiting`/`blocked`; redo makes a new one. `apply` takes a `Change`: a new task (`Op`),
  `{ edit: id, text }` (the words before the `---`, with the message's revision, undone by writing the old text back
  unless it was edited since) or `{ remove: id }` (canceled, which a board never reopens, so the record keeps the task
  whole and undo adds it again under a new ID). Both only for an open task of the channel's with `deictic.at`.
  `client.ts` is the Task tab: each listed task's ID is a link, and an open one has Edit (a field in its place, a
  `data-deictic-modal` so Esc is its) and Delete. With
  screenshots loaded it attaches a shot: the op names it, `apply` uploads it to the board
  through `use('screenshots')` (the server context kept from `setup`), and the record keeps the
  attachment's ID for redo. With annotations
  loaded, Annotate captures a shot and `edit`s it: saved, each is a chip (removable; removing the last unticks the
  box). Every chip opens one lightbox of all that's attached, at itself: a shot with Change marks, a recording's
  replay (`?embed`) with New tab, a voice note's player; and sending uploads each `flatten`ed PNG with `screenshots.upload`. `Op.screenshots`
  is a list, each with its `box` and `marks` (count and notes). With recordings loaded, Record calls
  `away` with what's typed and attached, and the panel comes back with the recording as a chip;
  `Op.recordings` attaches each one's JSON (and its voice clips) and says how long it ran and where it replays.
  After a task is added, the page hears of it: a `deictic:task` event on `window` (`TASK_ADDED`), its
  `detail` a `TaskAdded` (ID, title, state, channel, target, page, what was attached), which the playground lists as a board.
  With voice loaded, Voice records a take in the panel, its button the time and the mic's live waveform (`Take.stream`); `Op.voice` attaches each note's audio. Tests run it against `local({ memory: true })`. What works the tasks is the user's, not ours.

`skills/deictic/` is the agent skill, published with the package (`npx skills add ./node_modules/deictic`):
`SKILL.md` stays short and points to `references/` (install, watch, tasks, recordings), read only when needed.
`scripts/` are plain `.mjs` for Node 20+ or Bun with no dependencies (`lib.mjs` shared: `vb`, `.deictic/` folders,
finding a recording or clip by task, URL, ID or path): `watch.mjs` (a line per task event, over `vb tail`),
`task.mjs`, `recording.mjs` (a timeline), `frame.mjs` (PNGs through the replay's `?t=`, with the project's
Playwright), `voice.mjs` (speech times, with ffmpeg) and `transcribe.mjs` (Whisper through a pinned
transformers.js, installed with the model by `--setup` into `~/.cache/deictic/transcribe`, outside the project;
without it the script refuses and says what to ask the person, as the skill has the agent ask first). The recording's marks event carries `annotations` as data
for them. Change them with the task format, the replay page or the marks event.

`examples/vite` is React + Tailwind v4 and imports deictic from `dist`, so build first. `dist`'s shared chunks
have no hash in their names (`hash: false`), so rebuilding under a running dev server doesn't break its imports;
restart it to load the new build (the site's restart restarts its board too, which ends a `vb tail`). `examples/next`
(port 5181), `examples/rspack` (5182) and `examples/bun` (5183) are the same page on the other
integrations, also from `dist`; `test/integrations.test.ts` covers each integration, Rspack with a real compile.
`test/production.test.ts` runs real production builds (Vite, Rspack, `Bun.build`) and fails on any mention of deictic
in their output, each scan first shown to find it in a build where deictic runs. With the React Compiler on, marking
must still see JSX as written: `integrations.test.ts` covers Vite (`react({ compiler: true })`) and Rspack (`babel-loader`
with `babel-plugin-react-compiler`), and `test/next-dev.test.ts` runs a real `next dev` with `reactCompiler: true`, deictic
from `dist` (build first), in a fixture whose `node_modules/deictic` is the manifest and a link to `dist` (a link to the
repository would loop, as it holds the fixture).

`site/` is the homepage (`src/pages/home.tsx`) and a playground (`example/`, `src/pages/example.tsx`), a Vite
multi-page app running both plugins on itself, also from `dist`. `site/board.ts` starts `vb serve` on
port 4100 (tasks in `site/.board`) unless `BOARD_URL` is set, and gives the page its URL.

`site/internal/` (`/internal/`, `src/pages/internal.tsx`) is the dogfood page: each tab of the popup pinned with
`popupIn` beside a button, to Alt-click inside and leave tasks about deictic's own UI. Dev only: not linked, not
built. A task from it is about the popup: its `Pointed at` path (and `data-tab`) says which part, so find that
in `src/client/` or the plugin's `client.ts`, not in `internal.tsx`. Add a pinned state there when a UI needs one;
the lightbox is pinned there too (`lightboxIn`), with a drawn capture, the playground as a page and made-up voice.

## Conventions

- Problem messages state the fix: `no <div> at src/App.tsx:3:5 any more: … so reload it`.
- Comments say what the code cannot: the reason, the constraint, the trap.
- Imports from parent directories go through the `#src/` alias, with the extension.
- Early returns over nested conditionals; no dead code; LF line endings. Scripts that write files write LF too.
- Check for existing utilities before creating new ones. Moved code leaves no re-export behind: update every importer.
- Don't edit `version` in `package.json`: a Tegami changelog entry is the bump (the `changelog` skill).
- When changing user-facing APIs, update README.md, AGENTS.md and the skill (`skills/deictic/`) in the same change.

## Commits

Commit after each milestone: once a coherent step works and `bun run checks` passes, commit it before starting
the next one, on the branch that's checked out.
