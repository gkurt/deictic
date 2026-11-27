---
packages:
  'deictic': minor
---

### An agent driving the browser can use deictic in the page through WebMCP, with `deictic({ webmcp: true })`

What the person points at, where an element is written, the elements a file renders, the person's marks, React's state, screenshots, recordings and the board's tasks, as tools in `document.modelContext` (agent-browser turns it on in its Chrome). With `webmcp: { write: true }`, it can also add tasks and replies, set Tailwind classes, and undo. A plugin's page half offers its own with `webmcp(context)`.
