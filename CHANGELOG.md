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
