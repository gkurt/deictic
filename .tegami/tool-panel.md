---
packages:
  'deictic': minor
---

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

### The popup is Task and Tailwind

The Annotate tab is gone, with the Task tab's Annotate, Record and Voice buttons and the editor that drew on a
screenshot: the tool panel has their tools. The recording's own toolbar is the tool panel, too.

- `annotations({ shortcut })` is gone, as it has no tab to open, and its page API is the marks alone: `edit`,
  `flatten` and `tools()` are gone.
- A task's `screenshots` have no `marks`, and no `deictic.screenshot.N.note.M` labels: notes are the page's,
  `deictic.note.M`. One taken from the tool panel has no `box`, so no `.position` and `.size`.
- `page: true` on a plugin's page half is gone.

### A plugin can add tools, and what they make: `context.tools`, `context.tray`

`tools.add(group)` puts a group of controls in the tool panel, each button's key in `aria-keyshortcuts`, which the
panel hears. `hold(left)` takes the page for a tool until the panel gives it back, `keep()` keeps the panel up, and
`pick()` answers the next point pressed on the page. `tray` is what the tools made that no task has taken.
`context.open(plugin, element, at)` opens the popup on a point of an element, which the panel gets as `context.at`.
