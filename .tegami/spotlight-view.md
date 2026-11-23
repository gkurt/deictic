---
packages:
  'deictic': minor
---

### A spotlight view: `deictic({ view: 'spotlight' })`

The page dims around the element you point at, which stays lit with guides from its edges across the window. The
popup opens beside it, tied to it by a line, and the page gets its light back once the pointer is out on it. A
button in the popup switches between this and the popup view, and the browser remembers which.

It shows the tasks on the page: while the keys are held, each element with a task still to do has a pin on its
corner, and with the Task tab open a pin reads its tasks under the pointer and opens them with a click. The tab's own
tasks are cards there, read whole, with the window's height to scroll in.

### A plugin's tab can say it works on the page, not the element: `page: true`

While it's shown nothing marks the element, as in annotate mode.

### A plugin can draw on the page while the spotlight view points: `pointing(context)`

It answers what takes it away again. The overlay's host says the view (`data-view`), for a plugin's styles.

### `context.open` leaves a popup that holds something unsaved

Its button shakes, as it does for a press on the page, and `open` answers false.
