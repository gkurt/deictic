## deictic@0.7.0

### A task's elements are attached, and there can be several

The element the popup is on is a chip in the Task tab's composer, with what else is attached. The crosshair button
attaches another: the next press on the page picks it. A task about several is listed and pinned at its first, names
the rest as `deictic.also.N` (`src/Nav.tsx:4:7 <a>`, each one's HTML in `element.N.html`), and has them all outlined
in its screenshot. With every element taken out, the task is about the page, and has no `deictic.at`. `deictic task`
says both.

### An element is named by its component

The caption while pointing, the popup's bar and a pin's card say the component whose JSX has the element, with React
in development: `<Plan> <li>`, or `<Badge>` alone for the only element a component writes. Without, it's the tag, as
before.

### A panel can apply on another element: `apply(op, on)`

For an op that's about another element than the popup's. The model answered is then that element's.

### Paste a picture into the composer

A picture pasted into the Task tab's composer or a reply's, or dropped on it, is attached as a screenshot, which its
chip's lightbox offers to draw on.

### The tool panel keeps the capture tools together

Screenshot, Record, the mic and Task sit side by side at the end of the tool panel, after the drawing tools. A plugin
puts its group in a section with `tools.add(group, { section })`: groups of one section sit together, with no line
between them, after the groups of none, and `last` puts one at its section's end. The gap after Record is gone, and
while a recording goes its controls are the only ones in that section.

### Attachments keep one size

Every attachment chip, in a composer and in the drawer, is one height, and a picture's thumbnail one size whatever
its shape: nothing moves as one is attached or as its picture loads.

### The agent skill is one short file

`skills/deictic/` is a single `SKILL.md`, the loop and nothing else: no `references/`, and no rules on committing or
on what a task may ask, which are the person's. What the references explained, the commands now say as they run:
`deictic task` says how to read a task's source chain, the markup pointed at, and a task about the page as a whole,
and `deictic voice` says how to line speech up with the recording's frames.

### Shorter command output, for an agent's context

`deictic watch` says a ready task as it says a new one (its words, place, page and project), not with every label.
`deictic task` says how to download what's attached once (`--out <dir>`), not a command per file, and a task's voice
clips' commands once; its paths are from where it runs. `deictic recording` writes the page's own URLs as paths (a file
Vite serves from outside its root as the file's path, without a cache-busting query) and the marks all cleared as
`− all N marks`; `--json` keeps every URL whole. `deictic voice` gives each clip's path from where it runs.

### The overlay is a spotlight

The page dims around the element you point at, which stays lit with guides from its edges across the window. The
popup opens beside it, tied to it by a line, and the page gets its light back once the pointer is out on it. The
outline and the popup under it are gone.

It shows the tasks on the page: while the keys are held, each element with a task still to do has a pin on its
corner, and with the Task tab open a pin reads its tasks under the pointer and opens them with a click. The tab's own
tasks are cards, read whole, with the window's height to scroll in.

### A plugin can draw on the page while it's pointed on: `pointing(context)`

It answers what takes it away again.

### `context.open` leaves a popup that holds something unsaved

Its button shakes, as it does for a press on the page, and `open` answers false.

### Annotation tools have keys, and no hints

Each drawing tool has a key, and its tooltip is its name and the key, as a keycap. The line of advice under the
tools is gone. Esc in a note being typed drops the note, and no longer closes what's around it.

### A control's keys show in its tooltip: `aria-keyshortcuts`

A plugin sets `aria-keyshortcuts` (`Control+Z`) on a control, and the overlay's tooltip draws each key as a keycap
after the control's `title`.

### The drawer

While the shortcut's keys are held, a drawer on the window's side has what there is for the page: every task of the
channel still to do, the latest finished folded under them, and the screenshots, recordings and voice notes no task has
taken yet. It stays while the pointer is on it, and goes at once when the last thing in it is deleted.

A task opens in the drawer, from its row or from its pin on the page: its state, its words, what it has attached,
and its thread. A screenshot, a recording, a voice note or an element's HTML opens in the lightbox. The composer under
the thread replies on the board, so an agent that asked is answered from the page, and a reply attaches what a task
does: a screenshot, a drawing, a recording, a voice note. `deictic task` lists a reply's attachments under it. A task
no one has claimed can be edited and deleted there. The pointer on a task's row lights its element on the page.

The drawer folds away to a pill that counts what's in it, or what's unread. Finished tasks can be archived, one or
all: they're out of the drawer until something happens to one.

### Unread tasks

A task an agent answered, blocked, completed or failed since you last opened it has a dot, in the drawer and on
its pin, and the replies that are new are outlined in its thread. It's kept in the browser.

### Enter sends

In the Task tab's composer, and in a reply's, Enter sends and Shift+Enter starts a new line. Enter saves a task's
edited words too.

### The Task tab is for a new task

It no longer lists the element's tasks or the file's: they're in the drawer. The tasks plugin's `apply` only adds
a task (the `Change` type, with its `edit` and `remove`, is gone, and so is the model's `elsewhere`), and its `page`
route answers `{ channel, link, tasks }`, every task with how its thread stands. `thread/<id>` (with each message's
`files`), `file/<task>/<file>`, `reply/<id>` (with attachments, an `Answer`), `edit/<id>` and `remove/<id>` are new, and a `standalone` module answers them where it keeps tasks.

### A plugin can add to the drawer: `context.drawer`

`add(section)` puts a section in it, `show(view)` opens an item in the sections' place, and `keep()` keeps the drawer
up. A section with nothing hides itself, and says how many things it has in `data-count` (and unread in `data-unread`)
for the folded drawer's pill. `context.light(element)` lights an element on the page as pointing does.

### The tool panel

While the shortcut's keys are held, a bar of tools shows at the bottom of the window: drawing on the page, a
screenshot, a recording, the mic, and a task about a point. It goes a moment after the keys are let go, unless it's
in use (a tool has the page, a recording or the mic is on, the pointer is on it), and its grip drags it to any edge.

Each tool has a key, which works while the keys are held or a tool has the page: `V` or `Esc` the pointer, `M` box,
`A` arrow, `B` pen, `N` note, `Ctrl+Z` (`⌘Z`) and `Shift+Backspace` for the marks, `S` screenshot, `R` record and
stop, `Shift+R` discard, `K` the mic, `T` task.

What the tools make waits for the next task: the Task tab lists each shot, recording and voice note as a chip, and
the task takes them, and what's drawn on the page, as it's added.

### A task can be about a point

The Task tool's next press on the page opens the Task tab on that point, wherever it is: in the marked element under
it, or beside the nearest one. The task is pinned there, its screenshot has the point circled, and it says the spot
as `deictic.point` (`x,y` from the element's top left), which `deictic task` prints.

### The popup is Task and Tailwind, and the Task tab's field is a composer

The Annotate tab is gone: marks are drawn on the page with the tool panel's tools. The recording's own toolbar is
the tool panel, too.

The Task tab's field has what's attached over the words, a chip each, and its buttons under them, as icons:
screenshot and HTML snapshot, on or off, then draw (a screenshot to draw on, as Annotate was), record and voice, and
an arrow that adds the task.

A task's pin is pressed while the keys are held, too: it opens that element's tasks.

- `annotations({ shortcut })` is gone, as it has no tab to open. Its page API has `draw()`, which starts drawing on
  the page as the tool panel's tools do, and no `tools()`.
- A screenshot taken from the tool panel has no `box` in a task, so no `deictic.screenshot.N.position` and `.size`.
- `page: true` on a plugin's page half is gone.

### A plugin can add tools, and what they make: `context.tools`, `context.tray`

`tools.add(group)` puts a group of controls in the tool panel, each button's key in `aria-keyshortcuts`, which the
panel hears. `hold(left)` takes the page for a tool until the panel gives it back, `keep()` keeps the panel up, and
`pick()` answers the next point pressed on the page. `tray` is what the tools made that no task has taken.
`context.open(plugin, element, at)` opens the popup on a point of an element, which the panel gets as `context.at`.

### The `deictic:task` event says where each attached shot is, so a page can show it

## deictic@0.6.0

### What a task's element rendered through is a label, `deictic.source`, not a `Source:` line in its text

`deictic task` still prints it as `Source:`, from the element's own place out.

### A task goes in wherever the page's element isn't found in its file

It used to be refused, with "the file changed since the page loaded" even where it hadn't. A plugin's `read` and
`apply` now get the `Source` or the `Refusal` saying why there's none, to throw where they need it: only text edits
are refused without it.

### An element whose column is off is found by its line

Where its line has only one of its tag. Otherwise the problem says what the line has, not that the file changed.

### A task's text is only what was typed: the rest is its files and labels, numbered from 1

Only what the files don't say: `deictic.screenshot.N.position`, `.size` and `.note.M` for the Nth PNG attached,
`deictic.note.M`, `deictic.recording.N.replay`, `deictic.pointed` and `deictic.dropped.N`. `deictic.position` and
`deictic.size` are gone, and a URL too long for a label goes with its path only. `deictic task` prints them all.

### `deictic init` puts deictic first among the plugins

Last, a plugin before it that changed a module had the page point at that plugin's code, not the file. Move it first
in a config `init` set up before.

### A task's text no longer says its screenshot has the element outlined, and the outline has no white under its dashes

### A task goes without an attachment that's no longer kept

It used to be refused whole. Now it says what it went without, and so does the panel.

## deictic@0.5.0

### `npx deictic clean` deletes what deictic kept

- It says what it found under each `.deictic/` near here and how big, then asks. By default it deletes the shots, recordings and voice notes; name `history`, `board` (the local board's tasks) or `all` for the rest, which it refuses while the dev server's board is running. `transcribe` deletes the transcription model and its runtime, outside the project. With no terminal to ask on, it only lists them, and deletes with `--yes`.

### `deictic watch` starts on a fresh board, and the commands name the project's own runner

- `deictic watch` makes its channel where the board has none yet, instead of failing until the first task is posted.
- `deictic task` no longer prints `Result: null` and `Reason: null` for a task that isn't over.
- The commands each command's output names use the project's runner (`bunx deictic`, `pnpm exec deictic`, `yarn deictic`), so an agent following them doesn't get npm's notices in every command's output; the skill says the same.

### The `deictic` command's help says every option

- `deictic --help` and `deictic <command> --help` are generated from each command's arguments and options, so every option is listed with what it does and its default. A mistyped command gets a suggestion (`Did you mean task?`), and a missing argument or a value a command doesn't take is said with a pointer to `--help`.
- `deictic help <command>` is the same as `deictic <command> --help`.
- The command needs Node 22.12 or later.

### `deictic watch` follows a restarted board wherever it comes back

- A board started again on another port is followed there, instead of the watch going quiet while it asks the old one.
- Every restart says the board went away and that it's back, with the reason in the watch's own line, not the board CLI's raw error.
- After a restart the watch picks up from the last event it heard, and no longer lists the ready tasks again, which could repeat a task already done.

## deictic@0.4.0

### The skill's scripts are the `deictic` command's

- What the agent runs to work tasks is now the package's own command, `npx deictic <command>`: `vb`, `watch`, `task`, `recording`, `frame`, `voice` and `transcribe`, as the scripts were, with `--help`. It reads tasks and recordings with the version of deictic that wrote them. The skill's `scripts/` folder is gone.
- `deictic watch` also ends when a process a few above it does, so a watch run through `npx` stops with the session that started it.
- The skill is the loop in a few lines, with a few pointers each for watching, reading a task and recordings; its setup reference is gone, as `npx deictic init` is the setup. What to do next is in the commands' own output: a canceled task, a transcription to ask about, a recording's problems.
- The commands write to the board as the coding agent running them, by what its harness sets (`CLAUDECODE`, `CODEX_THREAD_ID`, `AI_AGENT` and the like), with no `BOARD_PROFILE` on every command. `BOARD_PROFILE` still names another, and a person at a terminal writes as themselves.

### `npx deictic init` sets a project up, and a plugin's missing packages are said as the dev server starts

- `npx deictic init` installs deictic and what the recommended plugins use with the project's package manager, adds deictic to the Vite, Next.js, Astro, webpack or Rspack config, or to a Bun server that bundles an HTML page (`deictic.plugin.ts`, `bunfig.toml` and its routes in `Bun.serve`), and says what to add where it can't tell where, and offers to add the agent skill. `--dry-run`, `--no-install`, `--skill` and `--no-skill` change what it does.
- A plugin names what it imports that the project installs (`packages`, on `ServerPlugin` and on a screenshots renderer). The dev server warns of any that's missing as it starts, with the command that installs them, rather than the first shot or recording failing.

## deictic@0.3.1

### A task's source chain names the components, its outline is where the element was drawn, and a watch outlives a restart

- `Source:` in a task now names the components the element rendered through, where the page is React in development: `src/ui/label.tsx:6 ← Field (src/Field.tsx:20) ← Panel`. A component with no element of its own around the one clicked, which the chain used to skip, is there by its name, and a layout component the element was only passed through isn't. Three at most, so it stops before the app's shell. Other pages keep the chain of `file:line`s.
- A screenshot's outline is drawn where the element is in the shot. The `rrweb()` renderer measures it in the page it rebuilt, which can lay out a few pixels from the live one, and a shot of an element alone is cut there too. A renderer's `render` may answer `{ png, box }`.
- The skill's `watch.mjs` waits for a board that went away (a dev server restarted, and its board with it) and follows it again from the last event, where it used to end on the new board's first refusal.
- The Task tab's dot says who holds a claimed task (`claimed by claude`, `Task.by` in the tab's model), and the skill's `task.mjs` says `asked by` for who wrote the task and `Claimed by` for who holds it: a completed task read as if the person had completed it. Who completed it isn't said, as a board's record of a task keeps no one for its end.

## deictic@0.3.0

### The Task tab's list stays five rows high, folds closed tasks away, and shows Edit and Delete on hover

### A long task title is cut short in the Task tab, not run past the panel

### In the Task tab a task's state is a dot, and a click on its title shows all of its text

### A task says more of what an agent couldn't work out: where a shared component is used, what the element rendered as, and which element the screenshot is about

- After its words a task names the chain of source the element rendered through, from its own line out to where its component is used (`Source: src/ui/label.tsx:6 ← src/ParticipantsField.tsx:20 ← src/WorkflowPanel.tsx:880`). The element's HTML as it rendered is attached as `element.html`, masked as screenshots are, while the Task tab's Attach HTML snapshot box is ticked; `tasks({ html: false })` takes the box away.
- The screenshot a task takes as it goes has the element outlined in it, in dashes; one that was annotated is as it was drawn.
- The screenshots plugin's page API has `masked(element)`: a copy with what a shot hides hidden in it too.
- The `rrweb()` renderer renders at the window's size, scrollbars included: a window right on a breakpoint no longer renders as the narrower layout, with the element somewhere else.
- The skill: `scripts/vb.mjs` runs the project's own `vb` on the dev server's board, with no PATH or `BOARD_URL` to set; the agent is told to post under its own `BOARD_PROFILE`, and `watch.mjs` then leaves its own replies out; `task.mjs` lists the page's other open tasks, and names a file to download an attachment to.

### A recording goes on when the page reloads or you follow a link to another page of the site

- The toolbar comes back on the next page with its time still running, and the mic on if it was. Stop it there and the Task tab opens with the recording, about the element you started on, whether that page has it or not: without it, it opens in the middle and says the element is not on this page. Before, a page load lost the recording and what was typed.
- The replay plays each page in turn, and the skill's `recording.mjs` has a `page` line where each starts. A route change with no load is in the recording too, as a custom event tagged `deictic.page` with the new address, and a `page` line of its own.
- A recording that goes on in the same page to where the element is gone (a route change) comes back to the Task tab too; the popup used to stay closed.
- The recordings plugin's routes are `begin`, `part/<id>`, `end/<id>` and `discard/<id>` in place of `add`, as a recording is sent as it goes; voice sends a take the same way, with `more/<id>` after `add`. A `standalone` module answers these.
- For plugins: `Recorder.going()`, `Take.soFar()`, and a page half's `resume(context)`, which says that what its panel left for (`away`) carries on after a page load. A panel's `element` may be off the page when it comes back.

### The Task tab says whether an agent is watching, and a watch ends when the channel goes quiet

- Beside the channel the Task tab shows who's watching it (`claude watching`), or `no agent watching`: whether a task you add now is taken up. A board can't say who listens, so the skill's `watch.mjs` says it while it runs (a file under `.deictic/watchers`), and the tab's model has it as `watching`. An agent holding a claim on one of the channel's tasks counts too, so one at work between watches still shows. A custom `board` now needs `actors`, as `board()` has.
- `watch.mjs` ends by itself once nothing has happened on the channel for 20 minutes (`--idle`), and the skill has the agent stop there and say so, not start it again: no agent watches for ever. It also ends when the process that started it does, so a watch a finished session left behind doesn't go on showing.
- `watch.mjs --once` ends at the first task, reply or cancellation, for an agent that's woken only when a command exits. The skill uses it in place of `vb tasks claim --wait`, so those agents show as watching too.

### A recording has the page's console, its requests and its canvases, and the replay shows them

- Two new plugins, both in `recommended()`: `logs` (`deictic/logs`) and `network` (`deictic/network`). Add `@rrweb/rrweb-plugin-console-record` and `@rrweb/rrweb-plugin-network-record` to your dev dependencies, or leave either out: `recommended({ logs: false, network: false })`.
- `logs` keeps each console line, uncaught error and unhandled rejection at its moment; `levels` keeps fewer. The console is wrapped only while a recording is going.
- `network` keeps the page's `fetch` and XHR requests: the URL, status and timing, as the browser reports them, with nothing wrapped. `headers` and `body` add those and the method.
- Requests are masked before they're kept: a value whose name says it's a secret (`token`, `password`, `authorization`, `cookie`, `key`…) is `***` in a URL's query, a header and a JSON or form body; `mask` adds names and `ignore` leaves requests out.
- The skill's `recording.mjs` prints them in the timeline as `console.<level>` and `request` lines, and takes filters for a part of a long one: `--problems`, `--only console,request`, `--from`, `--to`, `--around`, `--grep`, and `--full` for stacks, headers and bodies.
- The replay page lists them beside the page: the row the replay is at is lit, a click on one goes to its moment and shows the rest (where a line was logged from, a request's headers and bodies), `Problems` keeps only errors and failed requests, and each of those is a mark on the timeline.
- A recording has what a `<canvas>` drew: a picture of each canvas that changed, twice a second, replayed in place. `recordings({ canvas: { fps } })` changes how often, and `canvas: false` records none.

### The Task tab lists the rest of the file's tasks, and keeps an element's own as it moves

Tasks carry a `deictic.file` label; a task added before this is listed at its exact place only.

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
