---
packages:
  'deictic': minor
---

### deictic/setup edits a bundler's config as deictic init does, for another tool's own setup

`addToConfig(file, code, entry)` adds the entry's imports and its value to a list of the config's, first or last, or wraps the whole config, and answers nothing where it can't tell where.
