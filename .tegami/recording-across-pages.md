---
packages:
  'deictic': minor
---

### A recording goes on when the page reloads or you follow a link to another page of the site

- The toolbar comes back on the next page with its time still running, and the mic on if it was. Stop it there and the Task tab opens with the recording, about the element you started on, whether that page has it or not: without it, it opens in the middle and says the element is not on this page. Before, a page load lost the recording and what was typed.
- The replay plays each page in turn, and the skill's `recording.mjs` has a `page` line where each starts.
- A recording that goes on in the same page to where the element is gone (a route change) comes back to the Task tab too; the popup used to stay closed.
- The recordings plugin's routes are `begin`, `part/<id>`, `end/<id>` and `discard/<id>` in place of `add`, as a recording is sent as it goes; voice sends a take the same way, with `more/<id>` after `add`. A `standalone` module answers these.
- For plugins: `Recorder.going()`, `Take.soFar()`, and a page half's `resume(context)`, which says that what its panel left for (`away`) carries on after a page load. A panel's `element` may be off the page when it comes back.
