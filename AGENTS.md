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
bun run staged   # the pre-commit hook (.githooks/, set by `prepare`): lint autofix + format the staged files
```

`bun check` and `bun fmt` are Bun built-ins, not scripts: never add a `check` or `fmt` script, it would shadow
them. Before finishing, run `bun run fix` then `bun run checks`. Fix the code; don't disable rules.

## Structure

One package, ESM-only. deictic is the glue and every plugin is optional: the core never imports
one (`src/plugins/` are subpath exports a user adds). Two halves that share only types (`src/index.ts`): code for the browser, which
must stay small and dependency-free, and the tools, which run beside the bundler in Node or Bun.

- `src/index.ts`: the plugin API, every part optional but `name`. `ServerPlugin` (`client`, `clientOptions` → the page's `context.options`, `shortcut`,
  `needs`, `packages`, `setup` → its API, `routes`, `read`, `apply` → `TextEdit[]` or `Done`, `undo`, `redo`,
  `describe`; any of them may be async) and `ClientPlugin` (`label`, `setup` → its API, `mount`), tied by
  `name`, sharing a `Model` and an `Op`. `ServerContext`/`ClientContext` carry `use(name)`, another
  plugin's API on the same side, typed through the `ServerApis`/`ClientApis` interfaces plugins merge
  into; the page's also `root` (the overlay's shadow root), `request(route)` to the plugin's routes,
  `open(plugin, element, at?)` to open the popup at a tab (on a `Point` of the element, with `at`, which the panel
  gets as `context.at`), `tools` (the tool panel, a `ToolPanel`), `zone` (the drop zone, a `DropZone`) and `tray` (a `Tray`). A panel's context has `apply(op, on?)` (on another element than the popup's, with `on`, whose model is then the one
  answered), `unsaved(action)`: the button that keeps
  what leaving would lose, or `undefined`, and `away(state, task)`: close, run
  `task`, reopen at the same tab and element with `resumed` (`state`, and `task`'s `result` or `problem`). A page load
  doesn't lose it: the state is kept for the tab's next page (`src/client/away.ts`), whose overlay asks the plugin's
  `resume(context)` for the task where it carries on there, and reopens when it's done. Back from `away` the `element`
  may be off the page (`isConnected` false): as it was left, or after a load an empty one of its tag and mark. `Refusal` is an op
  a plugin won't make, its message the fix; the endpoints answer it with 422 and the panel shows it.
  `Done` (`{ done: record }`) is a change the plugin made itself, not to a file: the history keeps the
  record, JSON, and hands it to the plugin's `undo` and `redo`. The parser is imported for its types only.
- A `ClientPlugin` with `pointing(context)` (tasks) draws on the page while a shortcut's keys are held, and answers
  what takes it away.
- `src/shortcut.ts`: a `Shortcut` (`modifiers` held exactly, `button`), shared by both halves. deictic's
  own (`deictic({ shortcut })`, `MASTER` Alt by default, `false` for none) opens the popup at the tab
  used last; a plugin's (its factory's `shortcut` option, none by default) at its tab. `checkShortcuts`
  orders and checks them, deictic's first as `OWN`, refusing two alike: integrations call it as they
  start, so a wrong one fails the dev server. `gestureOf` is what the overlay tests events with.
- `src/tools/plugins.ts`: `checkPlugins(plugins, own)` (names lowercase and unique, `needs` loaded, a
  shortcut only with a `client`, shortcuts with deictic's own) as an integration starts; `setUp` runs every server `setup` at once and
  answers the shared context, whose `use` reads lazily.
- `src/tools/locate.ts`: the transform. Marks host elements (lowercase JSX tags) with
  `data-deictic="file:line:column"`, where the opening tag's `<` is, in UTF-16 columns from 1, in `.jsx`, `.tsx`
  and plain `.js` modules (`JSX`; `parse` reads JSX in `.js`, and a module with no `<tag` in it isn't parsed).
  Must see the source as written, so integrations run it first. `lineStarts`, `position`, `offsetOf`.
- `src/tools/source.ts`: `sourceAt`, a target's file parsed (a JSX module, or an `.astro` component, whose `program`
  is its frontmatter's) and its opening tag found by offset and tag, or else the only one of its tag on that line (the page may count columns in code a plugin changed before deictic's), or a `Refusal` saying what the line has; `resolveFile`, which refuses anything
  outside the root or under `node_modules`; `applyEdits`, the edits as each file's new text.
- `src/tools/packages.ts`: a plugin's `packages`, what it imports that the project installs (deictic's optional peers):
  `missingMessage(root, plugins)`, found from the root as the bundler finds them, which `endpoints` warns as it starts,
  with the install command; `packageManager(root)` (the `packageManager` field, the nearest lockfile, then the running
  one's `npm_config_user_agent`), `installCommand` (deictic's own peer ranges, quoted, from `package.json`, inlined by
  the build). The screenshots renderer has `packages` too.
- `src/cli/init.ts`: `deictic init` (`--dry-run`, `--no-install`, `--skill`/`--no-skill`), one of the bin's commands
  (below): installs `deictic` and the recommended plugins' `packages` (and `launch-editor` for webpack
  and Rspack) the project lacks, as its own dev dependencies, since deictic's imports, the page's bundle and the skill
  all look in the project; `bundlerOf` from the dependencies, and Bun only where a module of the project's calls
  `Bun.serve` and imports an HTML file (`serverOf`), as Bun may run Vite or Next.js, or no page at all; `addToConfig`
  adds deictic first in Vite's or Astro's list or webpack's and Rspack's `plugins` (a plugin before it that changes a
  module would have the marks count in its code), or wraps Next's export, with oxc and
  `magic-string` (through `defineConfig`, never another call, as a merge's first argument is a base, a function, a
  `const`, `satisfies`; ESM or CommonJS), and nothing where it can't tell, where it prints the snippet. `cli/bun.ts`
  is Bun's: `deictic.plugin.ts` written, it first in bunfig's `[serve.static] plugins` (`addToBunfig`), its routes first
  in `Bun.serve`'s (`addToServer`). `cli/edit.ts` writes in the file's own quotes, semicolons, line endings and
  layout. It offers the skill on a terminal. `test/init.test.ts`.
- `src/tools/kept.ts`: `keptIn(root, …parts)`, a path under the project's `.deictic/`, made with a
  `.gitignore` of `*` the first time. Every default data path goes through it.
- `src/tools/history.ts`: every change as each file's whole text before and after, or as a plugin's
  name and record, in `.deictic/history.json`, each with its `scope` (the plugin, and the element as
  `file:line:column`). `undo(scope)`, `redo(scope)` and `list(scope)` are that scope's, the latest of it, and the whole
  history's with none. A file is put back whole while it's as the change left it; else only the lines the change wrote,
  where they're still there once (`swapped`), which is what takes a change back from under a later one to the same file.
  Anything else is refused. They call the plugin for its own (refusing when it isn't loaded). A redone
  record is replaced by what `redo` answers, and an undone one by what `undo` does, where it answers one. A new change drops its scope's redo stack.
- `src/tools/endpoints.ts`: `/__deictic/{read,apply,undo,redo}` (same-origin JSON POSTs only),
  `history` and `open` (GET; `undo`, `redo` and `history` scoped where the request names a plugin and the element's
  place, as the popup always does), and each plugin's `routes` under `plugins/<name>/<route>` (anything but
  GET and HEAD from the page's origin only, in any content type), over `Request` and `Response`;
  `nodeMiddleware` mounts them on Vite. Every request waits for the plugins' setups. A plugin without
  `read` reads `null` and isn't checked against the source; one without `apply` refuses ops. `read` and `apply` get
  the `Source`, or the `Refusal` `sourceAt` threw, for the plugin to throw where it needs it (Tailwind) or do without
  (tasks, which then leave out `deictic.line`): only text edits are refused for it.
  Writes run one at a time, since a plugin's own change may wait on the network.
- `src/vite.ts`: `enforce: 'pre'` and its transform `order: 'pre'` (before the React Compiler, also `pre`, compiles the JSX away), `apply: 'serve'`. In the browser each marked module appends
  `import "virtual:deictic/client"`, which starts the overlay with deictic's own shortcut and each plugin that
  has a `client`, and its checked shortcut where it has one. No plugins by default.
  `open` redirects to Vite's `/__open-in-editor`. With `standalone` (a module of the page's, from the root) it applies
  in a build too: elements marked, the overlay bundled, and `start` given that module's default export as `server` (a
  `Standalone`, in `src/index.ts`), which gets every request the overlay would send (`send`, in `src/client/index.ts`)
  in the dev server's place. An `add` answer of screenshots, voice or recordings may name its `url`, for what's kept
  where no route serves it.
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
- `src/next.ts`: `withDeictic(config, options)`, dev only: Turbopack rules for `*.tsx`/`*.jsx`/`*.js` (browser
  with the client, the server without, neither for `foreign` code), the same loader as a `pre` rule in the app's
  `webpack` for `next dev --webpack` (both always set: Next refuses a `webpack` key only with no `turbopack` one), the endpoints on a port of their own
  behind a `beforeFiles` rewrite, `open` redirecting to Next's `__nextjs_launch-editor`. Next loads its
  config with `require`, so the package's exports use `default`, not `import`.
- `src/bun.ts`: a `[serve.static]` plugin (`onLoad`, skipped in `Bun.build`) whose `routes` the server spreads
  into `Bun.serve`'s; `open` is `Bun.openInEditor`.
- `src/astro.ts`: the Vite plugin, and `injectScript('page', …)` of its client, in dev. `src/vite.ts` marks an
  `.astro` component too (`markAstro`, the file itself, not what Astro loads from it by a query), before Astro compiles it.
- `src/tools/astro.ts`: `.astro` components. `parseAstro(root, code)` reads one with the project's own Astro's parser
  (`@astrojs/compiler-rs`, Astro 7, required through `astro`: its tree is oxc's, a template as JSX, UTF-16 offsets) and
  answers a `Parsed` (the frontmatter's `program`, the template's opening tags) or the `problem`; `locateAstro` marks
  with it. No mark on `script`, `style` (an attribute makes Astro leave them unprocessed) or `slot`; none at all with an
  older Astro. `test/astro.test.ts` covers it, with a real `astro dev`, deictic from `dist`.
- `src/client/away.ts`: `keepAway`, `keptAway`, `dropAway`: a panel's `away` (tab, target, state) for the tab's next
  page. In IndexedDB, as the state may hold a `Blob`, under a key the tab's session storage has; gone after a day.
- `src/client/component.ts`: who wrote an element, where the page says: React's fibers in development (`fiberOf`,
  `ownerOf`, `componentOf`, which tasks' `chainOf` reads too). `named(el)` is how an element is told to a person, a
  `Named` (its tag, the component whose JSX has it, and whether it's the only element that component wrote: counted
  under the owner's fiber, to `LOOKED`), kept per element; `tell` writes it, `<Plan> <li>`, `<Badge>` or `<li>`. The
  caption, the popup's bar, a pin's card and tasks' element chips all say an element this way.
- `src/client/dom.ts`: `div`, `place`, `nameOf`, `reduced`, the little the overlay's parts all draw with, the mark
  (`ATTRIBUTE`, `targetOf`, `sameAs`: a plugin's page half reads them from here, not from the overlay),
  `toolButton(strokes, name, keys, run)`, a tool panel's icon button (`MOD` is Control, or Meta on a Mac), and
  `controlFor(within, e, loose)`, the control a key is for by its `aria-keyshortcuts`.
- `src/client/tools.ts`: `toolPanel(root, { spotAt, aim })`, the tool panel (`.tool-panel`; "panel" alone is a tab's
  body, as in `PanelContext`), `context.tools`: a bar docked to an edge (`deictic:tools` in `localStorage`, bottom
  centre first), dragged by its grip to the nearest of the four. It shows while a shortcut's keys are held (`point`,
  which the overlay calls), the pointer is on it, something keeps it (`keep()`: a recording, a take, a shot being
  made) or a tool has the page (`hold(left)`, one at a time: the next holder's `hold` calls the last one's `left`),
  and goes `LINGER` after. Plugins `add(group)` their controls from `setup` (`{ last: true }` for tasks', after the
  others'). Its own tool is the pointer (V), pressed while nothing holds. It hears the keys on `window`, before the
  page, while the keys are held or a tool holds: a control's `aria-keyshortcuts` is its key, which clicks it (a key
  alone, whatever is held while pointing; never one typed in a field of ours, or of the page's while only pointing),
  and Esc gives the page back. Not while a `data-deictic-modal` is in the root: the keys are the modal's. So a tool never listens for keys itself. `pick()` answers the next press on the page
  as a `Spot` (`spotAt`, in the overlay: the marked element under the point, through the overlay, or the nearest
  one, and the point from its top left), over a `.tool-surface` that takes the press, the page lit as for pointing.
- `src/client/tray.ts`: `tray()`, `context.tray`: what the tools made that no task has taken (`add(plugin, id,
value)`, `list`, `remove`, `subscribe`), in session storage (`deictic:tray`), so it's the tab's over page loads.
- `src/client/zone.ts`: `dropZone(root, { crowded })`, the drop zone (`.zone`), `context.zone`: a drawer on the
  window's right (its left while `crowded`, the tool panel docked right) of what the plugins have for the page, a
  section each (`add(section, { first })`; a section with nothing sets its own `hidden`, and the zone with none shown
  stays away). It shows while a shortcut's keys are held (`point`, which the overlay calls), the pointer or the focus
  is in it, something keeps it (`keep()`) or an item is open, and goes `LINGER` after. `show(view, { title, closed })`
  opens an item in the sections' place, under a head with a way back, and answers what closes it; Esc is the item's
  while the focus is in the zone or no popup is open (never a `data-deictic-modal`'s). `trayed(context, plugin, title,
row)` is a section of a plugin's tray items, a row each that opens it and a × that removes it: screenshots',
  recordings' and voice's sections are that, each opening the lightbox. `playMark()` is a row's play icon.
- `src/client/lighting.ts`: what's drawn on the page itself, `spotlight(root)`, a `Lighting`: `point` (what's under
  the pointer while a shortcut's keys are held; not `glide` where the page scrolled), `hide`, and `hold(element, panel, at?)`
  (the popup's element, for as long as it's open, or with `at` a circle of `SPOT` around that point of it: `spotOf`). It dims the page around the element with one shadow (`.veil`, under
  annotations' marks), and draws a ring, guides from its edges across the window and a caption (`.aim`); what's under
  the pointer inside the element, where it differs, is dashed (`.inner`). The light glides from one element to the
  next, by CSS transitions that only `.glide` turns on. Held, the ring and the line to the popup are SVG strokes (`.lit`,
  followed each frame; `CLEAR` pixels off the element, so a border tried on it shows apart from the ring; the line is
  drawn out with a light along it, CSS, once), with wide faint strokes
  for a glow and no filter; the veil is `.lifted` once the pointer has been out of the overlay for `LINGER`. Its
  classes share the root with every plugin's: name a new one that no plugin's styles have (`.chip` and `.stage` are theirs).
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
  under the control, kept on screen, or beside it in a bar that runs down (`aria-orientation="vertical"`). Set `title`, never draw a tooltip of a panel's own. A control's keys
  (`aria-keyshortcuts`, `Control+Z`) are in its tip as keycaps after the words, and a tip of their own for a control
  whose text already names it: set that for a shortcut, never write it into the title.
- `src/client/index.ts`: the overlay, in one shadow root (`style.ts`). Runs each page half's `setup`
  first (a failing one is logged, the rest go on). Each plugin with a `mount` is a tab in the popup.
  Lights the marked element under the pointer while a shortcut's keys are held (`lighting.ts`), shows the tool panel
  meanwhile (`tools.ts`; it lights the page the same way while a tool picks a spot; on a pin or
  the tool panel, which take the pointer, the light stays where it was), and opens the popup on
  its button (`click`, `auxclick` or `contextmenu`, the first of them per press): deictic's own at the
  tab used last (`localStorage` `deictic:tab`), a plugin's at its tab. Opened on a spot (`context.open`'s `at`), it's
  beside the spot, which is what's lit. While it's open over the page its element
  stays lit (nothing is drawn on the element itself; followed each frame), keys typed in it stop at the host, so the page's own
  shortcuts don't run on them, and its Esc is kept from the page. It follows its element as the page moves it
  (`keepInView`, read each frame) until it's dragged by its head, and then stays where it's put, in the window. A press on the page outside it closes it, unless the shown panel
  said `unsaved`: then its button shakes, the popup stays, and no shortcut or `openPopup` opens another over it
  (Esc and close still close it). The popup's head is the tabs and
  close, then open-in-editor (an arrow out, and an "Open in editor" tooltip), undo and redo, which are the shown tab's on this element (off when its `history` has nothing to take back or do again, titled with the change they would; read as a tab shows, after a change, and on pointerenter); a tab reads its model when shown (a read another overtook
  mounts nothing; the body keeps its height meanwhile, and "Reading…" shows only for a slow one), and after an undo or redo it remounts with the model read again. While an element marked
  `data-deictic-modal` is in the root, Esc is that modal's, not the popup's. Pointing goes down through open
  shadow roots (not the overlay's): the target is the nearest marked element around what's under the pointer,
  out through hosts, and what's under it, where it differs, is dashed and given to the panel as `pointed`
  (a task names its path and HTML). On an element that's not on the page (back from `away`, where the page moved on or
  another loaded) it opens in the middle, nothing lit, its bar saying `not on this page`. The popup is
  glass, its tabs pills, the tag in its bar; `keepInView` puts it to the element's right or left where there's room
  (`APART` from it, level with its top, as tall as the window lets it be), else below or above.
  The shown tab is marked by `.thumb`, a pill behind it, slid to the next. `openPopup(element, { tab })` opens it over the page as deictic's shortcut does, for a page's own gesture (the
  homepage demo's plain click). As it opens over the page and as it closes, the page hears `deictic:open`
  (`POPUP_OPENED`, its `detail` a `PopupOpened`: the element and the tab) and `deictic:close` (`POPUP_CLOSED`) on
  `window`: the homepage demo holds its selection still between them. `popupIn(container, { tab, element })` shows the real popup pinned in a
  page (its own shadow root, `.panel.pinned`, no Esc, reopened when closed, the last tab left alone).
- `src/plugins/tailwind/`: `index.ts`, the server half (where a class list sits: `spotOf`; in an `.astro` file a
  missing one is added as `class`, and a `class:list` is shown, not edited), and
  `client.ts`, the chip panel. Previews per element, keeping each one's runtime classes, and puts
  the page back on close only for an unsaved preview, so it never races the bundler's update.
  `catalog.ts` is what the project's Tailwind knows, from its own design system (v4's
  `__unstable__loadDesignSystem` in `@tailwindcss/node`, found from the root or through an integration's
  package; the `css` option names the stylesheet with the theme, read again when it changes): `complete`
  (a word typed, under variants and `!`, a class's modifiers after `/`, and variants), `info` (a colour, a
  value with theme variables and simple `calc` worked out), `alternatives` (a kind is the properties a class
  sets, ordered by size where it has one, written with the class's own variants and modifier, and `custom`
  to put a value in brackets) and `css` (for classes the page's build hasn't seen, in `@layer utilities`,
  `@property` lifted out). The routes of the same names answer the panel, and nothing without Tailwind v4
  (one warning, a plain panel). In the panel the field completes its last word (↑ ↓, Enter or Tab; the list
  is a `data-deictic-modal` while shown), a known class's chip shows a swatch or its value and opens the
  editor (also a modal; both are boxes in the overlay's root, fixed under what they're about and placed each
  frame, never in the popup's flow, which would resize it): its kind's classes, colours as rows of shades, and, behind its Custom button (open where the class
  already has one), a field (and a colour picker) for a value of one's own. A preview's CSS goes in a `<style>` in the page's head until the panel unmounts.
  `test/tailwind-catalog.test.ts` runs it on the site's Tailwind. A helper's other arguments come in the model
  as `others`, each an `Extra` (`extrasOf`): the classes it adds where the source spells them out (a string, a
  top-level `const` of one, an object's key) and what they wait on (`a && …`, `a ? … : …`, `{ ring: on }`), or
  only its source. One whose classes are a string in the file is `editable` (`shared` names the `const` it's
  in), and an op with `at` (its place in `others`) writes that string. In the panel each editable one is a state
  to pick beside `Base`: its classes become the chips, forced onto the clicked element while it's picked, and a
  dot marks those on the element now (most of their classes among its own, all the page says of a condition).
  Each state keeps its draft; Save applies every changed one, a change each. The rest show under their
  condition as dashed chips, faint while not on the element.
- `src/plugins/screenshots/`: no tab. `index.ts`, the server half: keeps the latest `keep` PNGs under
  `.deictic/screenshots` (IDs sort by time), answers `read(id)` to other plugins, and its `add`
  route takes a PNG, or JSON its renderer's `render` makes one of. A `Renderer` is a page module (`client`, which
  becomes the plugin's) and an optional `render`: `rrweb()` (default) and `dom()`. `client.ts` is
  `screenshotsClient(capture)`, the page half around a renderer's capture, which posts to `add` and answers the
  `Shot` with the element's `box`; nothing of deictic's is ever drawn. Its API has `masked(element)` too, a copy with
  what a shot hides hidden (`mask`, in `client.ts`), for a plugin that sends HTML. Its tool in the tool panel (S)
  takes the window, with the page's marks, into the tray; a problem is its tooltip. `dom.ts` draws in the page with
  `modern-screenshot`, masking the copy. `rrweb.ts` sends an `rrweb-snapshot` (masked by rrweb, the overlay cut
  out) with viewport, window, scroll and density, and which node the element is; `playwright.ts` answers the PNG and the element's
  `box` as it's drawn there (measured in the rebuilt page, as the two can lay out a few pixels apart, and what the `Shot` then has; a `render` may answer `{ png, box }`): it rebuilds it in a sandboxed iframe on a blank page of
  the page's origin (Playwright answers it) in a browser launched once (Playwright's Chromium, then Chrome, then
  Edge), and screenshots it. The browser is the window's size and shows its scrollbars (media queries ask the window's
  width, the layout has what the scrollbar leaves), and the shot is cut to the viewport. Masking options follow rrweb's names and defaults. Optional peers, each imported on
  first use. `test/rrweb.test.ts` compares a render with the live page by brightness (the iframe's text has no
  colour fringes) and skips without a browser.
- `src/plugins/annotations/`: marks on the page, page half only, no tab. `index.ts` is the types (`Shape`: box,
  arrow, pen, note, in page coordinates) and the factory (`color`). `svg.ts` is `toSvg(annotations, area, scroll)`,
  shapes only (no `foreignObject`), the one drawing both the page's layer and a shot use. `client.ts`: `setup` keeps
  the marks per page in session storage, draws them in a layer of the overlay that lets the pointer through, adds
  its tools to the tool panel, and answers `list`, `add`, `remove`, `clear`, `subscribe` (for a recording),
  `svg(area)`, `draw()` (picks the tool used last, for another plugin's UI: the tasks' marks chip),
  `edit(picture, marks)` (the same tools in a bar over a picture, in a modal over everything, with Cancel and Save;
  marks in the picture's CSS pixels; its bar hears its keys, `controlFor`) and `flatten` (its PNG with them drawn in). `draw.ts` is the tools (`drawing`, a group) and the gestures, on a surface over the page that takes
  the pointer only while a tool is picked (`tools.hold`, so the pointer tool, Esc or another plugin's tool gives the
  page back; Esc from the popup's field too). No words: each tool is an icon named by its tooltip, with its key (M box, A arrow, B pen, N note,
  Ctrl or ⌘ Z undo, Shift+Backspace clear, with a modifier as nothing brings the marks back), which the tool panel
  hears. A note being typed has its keys to itself (Enter places it, Esc doesn't). Screenshots' renderers draw
  `svg(area)` over a shot (`overlay` in a `PageCapture`), and a task names the count and notes, and clears the marks
  once it's added.
- `src/plugins/recordings/`: no tab. `index.ts`, the server half: keeps the latest `keep` recordings (JSON:
  `Kept`, rrweb's events with page, viewport and duration) under `.deictic/recordings`, answers
  `read(id)`, and routes `begin`, `part/<id>?seq=<n>`, `end/<id>` and `discard/<id>` (a recording comes as it goes: its
  parts are lines of `<id>.part`, put in order and kept as `<id>.json` at `end`; one nobody ended goes a day on), `recording/<id>`, `replay/<id>` (`replay.ts`, `rrweb-player` sized to the window,
  restyled dark under `#main`, the marks drawn in its replayer's wrapper and moved with its scroll, a timeline
  marker per marks event, voice in step at its speed, the `rrweb/console@1` and `rrweb/network@1` events as a list beside it (`#log`: the row
  it's at lit, a click goes there and opens the row, errors and failed requests marked on the timeline; not in `&bare`),
  `UNSAFE_replayCanvas` for a recording with canvas events; `?t=`, `&bare`) and `player.js`/`player.css`
  (`rrweb-player`'s build, an optional peer). `replayPage(sources)`, exported, is that page for one published as a
  file where there are no routes: `player` is the folder its two files are in, `source` a script that sets
  `globalThis.deicticReplay` (`recording(id)`, `clip(id)`), and the recording is `?id=`.
  `client.ts`: `record()` imports rrweb, records with the overlay blocked and masking as screenshots' (and each canvas
  as pictures, `sampling.canvas` at the `canvas` option's `fps`, 2, or not with `false`: never rrweb's other way, which
  wraps every drawing method), sends the
  events each second, and keeps what the next page needs in session storage (`deictic:recording`: the ID, the start, the
  next part's place, the clips, the mic). So a load doesn't end it: `setup` on the
  next page carries on under the same ID (rrweb's own `Meta` and snapshot per page, and for an address that changes with no load, a router's, a custom event,
  `PAGE` in `marks.ts`, with the `href`; the last events go with `keepalive`
  on `pagehide`; a page out of the back-forward cache reloads), and `going()` answers it there, which is what tasks'
  `resume` gives the overlay. It
  takes rrweb's own plugins from the plugins that add to a recording (`use('logs')`, `use('network')`: each a `Recorded`,
  whose `plugin({ sinceLoad })` answers a `RecordPlugin`; one that fails is warned of and left out), and
  the page's marks go in as custom events (`MARKS`, in `marks.ts`), an SVG in page coordinates, at start and each
  change. Its tool in the tool panel is Record (R): while one goes, its group (`.recorder.going`) has the time, the
  mic (K, with voice loaded), Stop (R) and Discard (Shift+R) in Record's place, and keeps the panel up. One that's
  stopped and kept goes in the tray, whoever started it.
- `src/plugins/voice/`: no tab. `index.ts`, the server half: keeps the latest `keep` clips under
  `.deictic/voice` as the audio a `MediaRecorder` makes (webm, ogg, mp4, by extension), answers
  `read(id)`, routes `add`, `more/<id>` and `clip/<id>`. `client.ts`: `start()` asks for the mic and answers a `Take`,
  which sends the audio each second (`add` its start, `more` the rest, the last with `?last`); `stop` lets the mic go and
  answers the clip, `cancel` answers none, and `soFar()` is the clip as far as it's sent, for a page that's going: a
  recording's take ends there, and the next page's mic starts another. Its tool in the tool panel is the mic (K): on,
  a take, with its time and live waveform, keeping the panel up; off, the clip goes in the tray. It's away while a
  recording goes, whose own mic (its live waveform beside it while on) makes a clip of each
  stretch it's on, at its offset (`Kept.voice`); the replay plays them in step and starts paused, as a browser
  plays sound only after a click.
- `src/plugins/logs/` and `src/plugins/network/`: what a recording has besides the page. No tab, no routes: each
  page half answers a `Recorded`, rrweb's own plugin (`@rrweb/rrweb-plugin-console-record`,
  `@rrweb/rrweb-plugin-network-record`, optional peers imported as a recording asks), so they listen only while one is
  going. Never write our own capture of either. `logs({ levels })`: the console wrapped by rrweb from start to stop.
  `network({ initiators, headers, body, mask, ignore })`: by default what `PerformanceObserver` reports (URL, status,
  timing; nothing wrapped), `fetch` and XHR only; `headers` or `body` have rrweb wrap `fetch` and `XMLHttpRequest`.
  `network/mask.ts` is the masking, rrweb's `transformRequestFn`: `maskRequest` blanks by name (`sensitive`) in a URL's
  query and fragment, headers and JSON or form bodies, cuts bodies, and drops deictic's own requests (a recording
  sends itself each second) and the `ignore`d. `test/network.test.ts` covers it. (`logs` is un-ignored in `.gitignore`.)
- `src/plugins/recommended/`: `recommended(options)`, the preset the docs show: tasks, screenshots, annotations,
  recordings and voice, in their tools' order in the tool panel (tasks' is last there), then logs and network (not without recordings), each with its options under its name or left out with `false`. Server
  halves only, like every factory. `deictic init` sets it up, and the README, homepage and skill lead with that, not a manual install. The README is short (what, why, how) and about tasks: no class editing (Tailwind) in it. `API.md` has the detail (bundlers, options, writing a plugin) and is published with the package; `CONTRIBUTING.md` is how to develop.
- `src/plugins/tasks/`: adds a task about the element to a Vercel Board (`@vercel/board`, an optional
  peer, imported when first used). `index.ts` writes the task's text as what was typed and nothing else (`See the recording` and the like where
  only something attached says it), and the rest as labels (`deictic.project`, from the `project` option
  or the root's `package.json`, `at`, `file`, `tag`, `line`, `page`, `url` where it fits, `viewport`, `count`, `source`), under
  the user's own `labels`; the source isn't sent. What the attached files don't say is labels numbered from 1
  (`attachedLabels`): `screenshot.N.position` and `.size` for the Nth PNG attached, where it's a shot of the element
  (it has a `box`; the window's, from the tool panel, has none), `.note.M` for a note drawn on it, `note.M` on the page, `point` (`x,y` from the
  element's top left, for a task about a spot: `Op.point`, read back as `Task.point`),
  `recording.N.replay` for the Nth recording, `dropped.N` and `pointed` (the path; its HTML is in `element.html`, or `pointed.html` without
  it). Control characters become spaces and a value is cut at 256. `deictic task` prints them. A task added before has them
  after a `---` in its text, which `deictic task` prints as it is and an edit keeps. `deictic.source` is the chain it rendered through, out from its own
  place, `deictic.at` (`Op.chain`, three at most, the farthest left out where they're past a label's 256 characters: with React in development the
  components that wrote it, read off the fibers' owners, each `Name (file:line)` with the line of its nearest element around
  this one, or its name alone where it has none; otherwise `file:line`s read off the marks around it, the nearest of each file
  in turn: where a shared component is used; no tags, as it's source, not the DOM). The element's HTML is attached as `element.html`
  (`Op.html`, masked by `screenshots.masked` where that's loaded; sent while the panel's Attach HTML snapshot box is ticked,
  as it is by default, and the `html: false` option, a `clientOptions`, takes the box away), for an agent to read only when it needs more. `read` lists the element's tasks by `deictic.at`,
  a task whose place moved still the element's own where its tag and `deictic.line`
  are the element's and the file has that line once (its `at` is where it was), and the channel's page
  (`link`, or `/c/<channel>` beside a local board's `/api/board`, from `discovery()`), each task with its own
  (`?thread=<id>` there, or `link(channel, id)`), its whole typed text and whether it's `open`. Undo cancels the task
  unless it's past `ready`/`waiting`/`blocked`; redo makes a new one. `apply` only adds a task (`Op`); the history's
  older records of an edit or a removal are still undone and redone.
  The routes are the drop zone's: `page` answers the channel's tasks as `Listed` (a `Task` with its `place`, `tag` and
  `page` where it has them, its `replies` count, its newest reply's ID as `last`, and what it came to as `said`): those
  still to do, oldest first, then the `OVER` (10) lately completed or failed; `thread/<id>` a `Thread` (the task and its
  `Reply`s: who, `kind`, text, when); `reply/<id>`, `edit/<id>` (the words before the `---`) and `remove/<id>` (canceled)
  take `{ text }` and answer the thread after. All only for a task of the channel's that's deictic's (`ours`: it has
  `deictic.at` or `deictic.page`), and the last two only while it's open.
  `store.ts` is those tasks on the page (`storeOf(context)`, one per overlay root): `load()` reads `page`, not again
  within `FRESH`, and `subscribe` tells of each read. What's unread is its: `deictic:tasks:seen` in `localStorage`, each
  task's mark as last opened (its newest reply's ID, and its state once blocked, completed or failed); `unread(task)` is
  a mark that differs, `seen(task)` writes it, and a browser's first read marks every task seen.
  `zone.ts` is the tasks' section in the drop zone (`zoneOf(context)`, added first): a row per task (state dot, title,
  state and who has it, what it's about as `tell(named())` or `<tag> on /page`, replies, an unread mark), those over
  folded in a `details`. A row opens the task in the zone (`context.zone.show`): `.stands` (state, the board's link,
  Edit and a Delete pressed twice within `SURE`, for an open one), `.where` (the element, outlined on the page as
  `.task-about` while it's open, scrolled to by a press), the words (a field while edited), what it came to, the thread
  (`.task-thread`; replies after the one last read are `.new`, never one written here) and a reply field. It reads
  `thread/<id>` again every `AGAIN`, and marks the task seen as it does. `open(tasks)` is a pin's: the task, or a list
  to pick from for several.
  `pins.ts` is the page's tasks where they are (`pinsIn(context)`, one set per overlay
  root), from the store: each place with an element
  on the page and a task still to do gets a pin, its outline and a badge on its corner (how many, the colour of the furthest along, a dot where one is unread), followed
  each frame; a task about a spot has a pin of its own there, the badge's point on it and no outline. `glance()` shows them while pointing (`pointing`)
  and while the Task tab is open over the page: a badge under the pointer shows a card of
  its tasks and a click opens them in the drop zone (`zoneOf(context).open`). A pin has no layer to stack in: each is
  fixed under the popup, and the one pointed at over it.
  `client.ts` is the Task tab, a composer and nothing else: the tasks there are, are the drop zone's. Under the field,
  the channel and who watches it (`Model.watching`, a dot and `claude watching`, or `no agent watching`:
  `watchers.ts` writes (`watcherAt`, for `deictic watch`) and reads the files a watch keeps under `.deictic/watchers` while it runs, a name, channel and time
  each, written again every 20s and dropped a minute old, as a board can't say who listens, and `agentsOf` adds whoever holds a claim on a task of the channel's that isn't a person, named by the board's `actors()`, so `TaskBoard` has it; empty only for a board of this machine's own, left out for another with none).
  A task that's added reloads the store, and the tab says it's in the drop zone. With
  screenshots loaded it attaches a shot: the op names it, `apply` uploads it to the board
  through `use('screenshots')` (the server context kept from `setup`), and the record keeps the
  attachment's ID for redo. A shot, recording or voice clip no longer kept (past its plugin's `keep`, or cleaned) is
  left out, not the task: `keptOf` drops it from the op, `deictic.dropped.N` says so, which `read`
  gives back as `Task.dropped` for the panel to say; only a task left with nothing to say is refused. The field is
  a composer (`.composer`): the chips, the textarea (as tall as what's typed, to `GROWN`), and `.attach`, icon
  buttons made with `toolButton`: Screenshot and HTML snapshot (`aria-pressed`), Element, Draw, Record, Voice, and
  Add (an arrow, Ctrl or ⌘ Enter). The elements the task is about are chips too (`about`, each an `About`: its
  target, the element where this page has it, and what the page said of it, `Seen`): the popup's own to begin with,
  and each the Element button picks (`tools.pick()`, only a press on a marked element), outlined on the page while
  attached (`.task-about`, followed each frame). The first is the task's place: the op is sent on it
  (`apply(op, on)`),
  the rest go as `Op.also` (place, tag, HTML: labels `deictic.also.N`, files `element.N.html` from 2), and with none
  the op is `detached`: the page's labels alone, no `deictic.at`, so no pin has it, and the drop zone lists it as about the page. What's in the tray (shots, recordings, voice clips) is the task's to attach: each a chip
  (removable, which takes it out of the tray), and every chip opens one lightbox of all that's attached, at itself:
  a shot, a recording's replay (`?embed`) with New tab, a voice note's player. The panel follows the tray
  (`subscribe`), so a shot taken while it's open is a chip at once, and a task that's added empties it and clears
  the page's marks, which have a chip too (`N marks`: it draws more, its × clears them). Screenshot is a shot taken
  as the task goes (`shooting`): on while nothing is attached, or as it was last pressed (`wanted`; taking the last
  shot out turns it off). It's of the task's first element (of the page, with none on it), sent first, and only it
  has the task's elements outlined (`outlined`, each in green dashes `ROOM` off it, the others where the page has
  them, moved by as much as the shot has the first off; or a circle of `SPOT` around the task's spot; drawn on and
  kept again with `screenshots.upload`), which
  the op says (`outlined`), not the text. `Op.screenshots` is a list, each with its `box` where it's of the element
  and its `marks` where it was drawn on.
  Draw captures a shot and `edit`s it: saved, the `flatten`ed PNG is kept (`screenshots.upload`) and put in the
  tray as a `Pictured`, a shot with what it was made of (`drawn`: the shot as taken, the marks, the element's
  place), so its chip's lightbox has Change marks, and the op has its `marks` (count and notes) and its `box` where
  the task is about the element it was taken of. Record calls `away` with what's typed and asked for (`Kept`), and the panel comes
  back with that, the recording in the tray by then; the kept state has the page, the viewport and each element as
  that page had it (`Seen`: point, count, chain, pointed, HTML) too: a recording stopped on a page without the
  elements comes back to a panel with no shot to take, and the task says those. Voice records a take here (`voice.start()`),
  its time and the mic's live waveform beside the button, and its clip goes in the tray; a take going as the task is
  sent, as Record leaves, or as the popup closes, is kept first. `Op.recordings` attaches each one's JSON (and its
  voice clips, which the JSON names), and a label says where it replays. Its tool in the tool panel (T, last, with a
  count of what's in the tray) picks a spot (`tools.pick()`) and opens the tab on it: `context.at`, sent as
  `Op.point`, and kept over `away` (`Away.at`).
  After a task is added, the page hears of it: a `deictic:task` event on `window` (`TASK_ADDED`), its
  `detail` a `TaskAdded` (ID, title, state, channel, target, page, what was attached, and each shot's URL as sent).
  `Op.voice` attaches each voice note's audio. Tests run it against `local({ memory: true })`. What works the tasks is the user's, not ours.
  `local.ts` is the board with no `board` option and no `BOARD_URL`: `localBoard(root)` spawns `vb serve` (the
  project's `@vercel/board`, this process's runtime) from `setup`, not waited for, on port 4100 or a free one, its log
  in `.deictic/board`, and writes `.deictic/board.json` (`url`, `pid`), which the CLI reads (`boardUrl`, in `src/cli/board.ts`).
  One that file names, alive and answering, is used as it is. `BOARD_URL` is then set, as `board()`
  takes a URL from nowhere else, for the `board()` call only. The team's board is `tasks({ board: board() })`.
  `local(options)`, exported from `deictic/tasks`, is that board as the `board` option, whatever `BOARD_URL` says:
  `port` (the only one tried), `dir` (from the root), `inspect: false` (`--no-inspect`, and no links in the panel)
  and `args` (more of `vb serve`'s). The file keeps the options too (`as`): one running with others is stopped first.

`skills/deictic/` is the agent skill, published with the package (`npx skills add gkurt/deictic`, or `./node_modules/deictic` for the installed one):
`SKILL.md` is the loop in a few lines and points to `references/` (watch, tasks, recordings), each a few pointers,
read only when needed. What a command's output can say (what to do on an event, a setup to ask about, how to find a
problem), it says there, not in the skill. Setting deictic up is `npx deictic init`. It has no scripts: the agent runs the project's installed deictic, `npx deictic <command>`, so what reads the tasks and recordings
is the version that wrote them. In this repository, `bun src/cli.ts <command>` (the root package has no bin of its own).

The commands are `src/cli.ts`, the `deictic` bin (`dist/cli.js`): commander, each command declared there with its
arguments and options and what they do (all `--help` shows: never write help by hand), and run from `src/cli/`,
imported only when it's run (`run(<arguments>, options)`, typed in the module). `vb` passes everything through. `board.ts` is what they share: `vb`, run as the project's `@vercel/board` script
(`vbScript`, from `tasks/local.ts`) on the dev server's board (`BOARD_URL`, or the nearest `.deictic/board.json`'s,
read with `runningAt`) as the agent running it (`profileOf`: `BOARD_PROFILE`, else the variable its harness sets,
`CLAUDECODE` and the like, else `AI_AGENT` cut to a profile's name; none at a person's terminal, who writes as
themselves), the `.deictic/` folders near here, `fail` (the message, exit 1), and
`ME` (how output names other commands: `npx deictic`, or the project's own runner, `execOf` in `tools/packages.ts`, as npm adds notices to every command's output); `find.ts` finds a recording or clip by task, URL, ID or path,
and runs ffmpeg and the project's Playwright. `init` (above); `clean` (for the person, like `init`: the `.deictic/`
folders near here, the shots, recordings and voice clips, or `history`, `board`, `all`, refused while a local board's
process lives, and `transcribe`, the machine's install; says each and its size, asks on a terminal, else deletes only
with `--yes`, and leaves a recording's `.part`); `vb` (that CLI, for the agent's own commands); `watch` (a
line per task event, over `vb tail`, on a channel it makes where the board has none yet, without the replies of the watcher's own profile; it ends, exit 2, once the
channel's had no event for `--idle`, 20m, and the agent then stops watching and says so, so none watches for ever;
`--once` ends at the first event, for a harness woken by an exit; it ends when its parent process or one of the three
above it does, as a runner like `npx` sits between it and the shell and outlives it, so one a session left behind isn't
watching; a board that goes away, as a restarted dev server's does, is waited for a minute and followed again from the
last event's cursor, where `.deictic/board.json` says it now is (it follows from a cursor taken as it starts, so it never lists what's ready again); while it runs it's in `.deictic/watchers`, `watcherAt` in `tasks/watchers.ts`, beside what reads
it); `task` (the task, who asked, who holds it, and the page's other open ones); `recording` (a timeline, or the part
of it asked for: `--only`, `--problems`, `--from`, `--to`, `--around`, `--grep`, `--full`); `frame` (PNGs through the
replay's `?t=`, with the project's Playwright); `voice` (speech times, with ffmpeg) and `transcribe` (Whisper through a
pinned transformers.js, installed with the model by `--setup` into `~/.cache/deictic/transcribe`, outside the project;
without it the command refuses and says what to ask the person, as the skill has the agent ask first). The recording's
marks event carries `annotations` as data for them. Change them with the task format, the replay page or the marks
event. `test/cli.test.ts` runs them, `task` and `watch` on a real local board.

`examples/vite` is React + Tailwind v4 and imports deictic from `dist`, so build first. `dist`'s shared chunks
have no hash in their names (`hash: false`; they go in `dist/shared/`, where none can take an entry's name) and a build doesn't empty `dist` first (`clean: false`; `prepack` does, with
`--clean`), so rebuilding under a running dev server doesn't break its imports;
restart it to load the new build (the site's restart restarts its board too, which ends a `vb tail`: `deictic watch` waits for the board and follows it again). `examples/next`
(port 5181), `examples/rspack` (5182) and `examples/bun` (5183) are the same page on the other
integrations, also from `dist`; `test/integrations.test.ts` covers each integration, Rspack with a real compile.
`test/production.test.ts` runs real production builds (Vite, Rspack, `Bun.build`) and fails on any mention of deictic
in their output, each scan first shown to find it in a build where deictic runs. With the React Compiler on, marking
must still see JSX as written: `integrations.test.ts` covers Vite (`react({ compiler: true })`) and Rspack (`babel-loader`
with `babel-plugin-react-compiler`), and `test/next-dev.test.ts` runs a real `next dev` on Turbopack and on webpack with `reactCompiler: true`, deictic
from `dist` (build first), in a fixture whose `node_modules/deictic` is the manifest and a link to `dist` (a link to the
repository would loop, as it holds the fixture).

`site/` is the homepage (`src/pages/home.tsx`) and a playground (`example/`, `src/pages/example.tsx`), a Vite
multi-page app running both plugins on itself, also from `dist`. Its build has deictic too (`standalone`), so Alt-click
works on the deployed site: `src/standalone.ts` answers it in the page (tasks and shots kept there, the tasks' `page`, `thread`, `reply`, `edit` and `remove` routes answered for the drop zone and the pins, a recording's parts and the voice clips in
IndexedDB for a day, so a recording carries on to the site's next page, class edits
on the element, no editor), and shots are `dom()`'s. A recording replays in `replay.html`, which `site/replay.ts`
publishes in the build with `rrweb-player`'s files; it asks the page that made the recording for it, over a
`BroadcastChannel`. Its tasks go to the tasks plugin's own board (`site/.deictic/board`, port 4100) unless
`BOARD_URL` is set. `site/code.ts` holds the
homepage's code and highlights it beside the bundler (`@pierre/highlights`, a theme of CSS variables that `site.css`
sets): the page imports the tokens as `virtual:code`, and no highlighter.

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
- When changing user-facing APIs, update README.md, API.md, AGENTS.md and the skill (`skills/deictic/`) in the same change.

## Commits

Commit after each milestone: once a coherent step works and `bun run checks` passes, commit it before starting
the next one, on the branch that's checked out.
