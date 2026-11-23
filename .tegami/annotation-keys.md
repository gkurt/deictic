---
packages:
  'deictic': minor
---

### Annotation tools have keys, and no hints

Each drawing tool has a key, and its tooltip is its name and the key, as a keycap. The line of advice under the
tools is gone. Esc in a note being typed drops the note, and no longer closes what's around it.

### A control's keys show in its tooltip: `aria-keyshortcuts`

A plugin sets `aria-keyshortcuts` (`Control+Z`) on a control, and the overlay's tooltip draws each key as a keycap
after the control's `title`.
