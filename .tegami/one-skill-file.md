---
packages:
  'deictic': patch
---

### The agent skill is one short file

`skills/deictic/` is a single `SKILL.md`, the loop and nothing else: no `references/`, and no rules on committing or
on what a task may ask, which are the person's. What the references explained, the commands now say as they run:
`deictic task` says how to read a task's source chain, the markup pointed at, and a task about the page as a whole,
and `deictic voice` says how to line speech up with the recording's frames.

### Shorter command output, for an agent's context

`deictic watch` says a ready task as it says a new one (its words, place, page and project), not with every label.
`deictic task` says how to download what's attached once (`--out <dir>`), not a command per file, and a task's voice
clips' commands once; its paths are from where it runs. `deictic recording` writes the page's own URLs as paths (a file
Vite serves from outside its root as the file's path, without a cache-busting query) and the marks all cleared as
`− all N marks`; `--json` keeps every URL whole. `deictic voice` gives each clip's path from where it runs.
