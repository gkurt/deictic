# Contributing

Issues and pull requests are welcome. deictic is developed with [Bun](https://bun.sh).

```bash
bun install
bun dev          # build, then the site on http://localhost:5180, with a board on this machine for its tasks
bun run test     # all tests, on the source
bun run fix      # lint autofix + format
bun run checks   # lint + type check + test
```

Before opening a pull request, run `bun run fix`, then `bun run checks`.

- `site/` is the homepage and a playground, running deictic on itself. `/internal/` on it pins deictic's own popup
  open at each tab, to leave tasks about deictic itself.
- `examples/` has the same page on Vite, Next, Rspack and Bun (`bun run dev` in each, after a `bun run build`).
- A change that ships in the package needs a changelog entry: `bun run tegami`. Don't edit `version` in
  `package.json`; the entry is the bump.
- [AGENTS.md](AGENTS.md) maps the source, file by file, and lists the conventions.
