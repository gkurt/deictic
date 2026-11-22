---
packages:
  'deictic': minor
---

### The skill's scripts are the `deictic` command's

- What the agent runs to work tasks is now the package's own command, `npx deictic <command>`: `vb`, `watch`, `task`, `recording`, `frame`, `voice` and `transcribe`, as the scripts were, with `--help`. It reads tasks and recordings with the version of deictic that wrote them. The skill's `scripts/` folder is gone.
- `deictic watch` also ends when a process a few above it does, so a watch run through `npx` stops with the session that started it.
- The skill is the loop in a few lines, with a few pointers each for watching, reading a task and recordings; its setup reference is gone, as `npx deictic init` is the setup. What to do next is in the commands' own output: a canceled task, a transcription to ask about, a recording's problems.
