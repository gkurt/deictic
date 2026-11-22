---
packages:
  'deictic': minor
---

### The `deictic` command's help says every option

- `deictic --help` and `deictic <command> --help` are generated from each command's arguments and options, so every option is listed with what it does and its default. A mistyped command gets a suggestion (`Did you mean task?`), and a missing argument or a value a command doesn't take is said with a pointer to `--help`.
- `deictic help <command>` is the same as `deictic <command> --help`.
- The command needs Node 22.12 or later.
