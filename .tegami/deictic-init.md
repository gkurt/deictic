---
packages:
  'deictic': minor
---

### `npx deictic init` sets a project up, and a plugin's missing packages are said as the dev server starts

- `npx deictic init` installs deictic and what the recommended plugins use with the project's package manager, adds deictic to the Vite, Next.js, Astro, webpack or Rspack config, or to a Bun server that bundles an HTML page (`deictic.plugin.ts`, `bunfig.toml` and its routes in `Bun.serve`), and says what to add where it can't tell where, and offers to add the agent skill. `--dry-run`, `--no-install`, `--skill` and `--no-skill` change what it does.
- A plugin names what it imports that the project installs (`packages`, on `ServerPlugin` and on a screenshots renderer). The dev server warns of any that's missing as it starts, with the command that installs them, rather than the first shot or recording failing.
