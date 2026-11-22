---
packages:
  'deictic': patch
---

### A task's source chain names the components, its outline is where the element was drawn, and a watch outlives a restart

- `Source:` in a task now names the components the element rendered through, where the page is React in development: `src/ui/label.tsx:6 ← Field (src/Field.tsx:20) ← Panel`. A component with no element of its own around the one clicked, which the chain used to skip, is there by its name, and a layout component the element was only passed through isn't. Three at most, so it stops before the app's shell. Other pages keep the chain of `file:line`s.
- A screenshot's outline is drawn where the element is in the shot. The `rrweb()` renderer measures it in the page it rebuilt, which can lay out a few pixels from the live one, and a shot of an element alone is cut there too. A renderer's `render` may answer `{ png, box }`.
- The skill's `watch.mjs` waits for a board that went away (a dev server restarted, and its board with it) and follows it again from the last event, where it used to end on the new board's first refusal.
- The Task tab's dot says who has a task or closed it (`completed by claude`), and the skill's `task.mjs` says `asked by`, `Claimed by` and `Completed by`. A board's record of a task names only who asked, so a task an agent completed read as the person's: who ended it is read off the board's events (`Task.by` in the tab's model; a custom `board` without `events` shows none).
