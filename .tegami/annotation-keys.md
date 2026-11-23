---
packages:
  'deictic': minor
---

### Annotation tools have keys, and no hints

`B` box, `A` arrow, `P` pen, `N` note, `Ctrl+Z` (`⌘Z`) to take the last mark back, `Shift+Backspace` to clear them,
and `V` for the pointer in a recording's toolbar. Each tool's tooltip is its name and its key, as a keycap. The line of
advice under the toolbar is gone. Esc in a note being typed drops the note, and no longer closes what's around it.

### A control's keys show in its tooltip: `aria-keyshortcuts`

A plugin sets `aria-keyshortcuts` (`Control+Z`) on a control, and the overlay's tooltip draws each key as a keycap
after the control's `title`.
