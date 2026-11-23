---
packages:
  'deictic': minor
---

### deictic's own problems are tasks on the board

A package the project hasn't installed, a plugin that failed to set up on the dev server or in the page, or a request
that broke is posted as a task, once while it's open, saying what to do: fix the setup, or report deictic's bug.
`tasks({ problems: false })` posts none. Plugins report their own with `context.report(problem)`, and hear them with
`problem(problem)`; a server plugin whose `setup` throws no longer stops the others.
