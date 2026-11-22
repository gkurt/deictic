---
packages:
  'deictic': minor
---

### A recording has the page's console, its requests and its canvases, and the replay shows them

- Two new plugins, both in `recommended()`: `logs` (`deictic/logs`) and `network` (`deictic/network`). Add `@rrweb/rrweb-plugin-console-record` and `@rrweb/rrweb-plugin-network-record` to your dev dependencies, or leave either out: `recommended({ logs: false, network: false })`.
- `logs` keeps each console line, uncaught error and unhandled rejection at its moment; `levels` keeps fewer. The console is wrapped only while a recording is going.
- `network` keeps the page's `fetch` and XHR requests: the URL, status and timing, as the browser reports them, with nothing wrapped. `headers` and `body` add those and the method.
- Requests are masked before they're kept: a value whose name says it's a secret (`token`, `password`, `authorization`, `cookie`, `key`…) is `***` in a URL's query, a header and a JSON or form body; `mask` adds names and `ignore` leaves requests out.
- The skill's `recording.mjs` prints them in the timeline as `console.<level>` and `request` lines.
- The replay page lists them beside the page: the row the replay is at is lit, a click on one goes to its moment and shows the rest (where a line was logged from, a request's headers and bodies), `Problems` keeps only errors and failed requests, and each of those is a mark on the timeline.
- A recording has what a `<canvas>` drew: a picture of each canvas that changed, twice a second, replayed in place. `recordings({ canvas: { fps } })` changes how often, and `canvas: false` records none.
