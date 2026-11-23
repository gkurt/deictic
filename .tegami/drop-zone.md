---
packages:
  'deictic': minor
---

### The drop zone

While the shortcut's keys are held, a drawer on the window's side has what there is for the page: every task of the
channel still to do, those lately over folded under them, and the screenshots, recordings and voice notes no task has
taken yet. It stays while the pointer is on it.

A task opens in the drawer, from its row or from its pin on the page: its state, its words, and its thread. The
field under the thread replies on the board, so an agent that asked is answered from the page. A task no one has
claimed can be edited and deleted there.

### Unread tasks

A task an agent answered, blocked, completed or failed since you last opened it has a dot, in the drop zone and on
its pin, and the replies that are new are outlined in its thread. It's kept in the browser.

### The Task tab is for a new task

It no longer lists the element's tasks or the file's: they're in the drop zone. The tasks plugin's `apply` only adds
a task (the `Change` type, with its `edit` and `remove`, is gone, and so is the model's `elsewhere`), and its `page`
route answers `{ channel, link, tasks }`, every task with how its thread stands. `thread/<id>`, `reply/<id>`,
`edit/<id>` and `remove/<id>` are new, and a `standalone` module answers them where it keeps tasks.

### A plugin can add to the drop zone: `context.zone`

`add(section)` puts a section in it, `show(view)` opens an item in the sections' place, and `keep()` keeps the drawer
up. A section with nothing hides itself.
