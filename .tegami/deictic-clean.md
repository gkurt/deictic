---
packages:
  'deictic': minor
---

### `npx deictic clean` deletes what deictic kept

- It says what it found under each `.deictic/` near here and how big, then asks. By default it deletes the shots, recordings and voice notes; name `history`, `board` (the local board's tasks) or `all` for the rest, which it refuses while the dev server's board is running. `transcribe` deletes the transcription model and its runtime, outside the project. With no terminal to ask on, it only lists them, and deletes with `--yes`.
