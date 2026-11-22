---
packages:
  'deictic': minor
---

### A task says more of what an agent couldn't work out: where a shared component is used, what the element rendered as, and which element the screenshot is about

- After its words a task names the chain of source the element rendered through, from its own line out to where its component is used (`Source: src/ui/label.tsx:6 ← src/ParticipantsField.tsx:20 ← src/WorkflowPanel.tsx:880`). The element's HTML as it rendered is attached as `element.html`, masked as screenshots are, while the Task tab's Attach HTML snapshot box is ticked; `tasks({ html: false })` takes the box away.
- An attached screenshot has the element outlined in it, in dashes.
- The screenshots plugin's page API has `masked(element)`: a copy with what a shot hides hidden in it too.
- The `rrweb()` renderer renders at the window's size, scrollbars included: a window right on a breakpoint no longer renders as the narrower layout, with the element somewhere else.
- The skill: `scripts/vb.mjs` runs the project's own `vb` on the dev server's board, with no PATH or `BOARD_URL` to set; the agent is told to post under its own `BOARD_PROFILE`, and `watch.mjs` then leaves its own replies out; `task.mjs` lists the page's other open tasks, and names a file to download an attachment to.
