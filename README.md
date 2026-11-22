<p align="center">
  <a href="https://gkurt.com/deictic/">
    <img src="https://raw.githubusercontent.com/gkurt/deictic/main/site/public/icon.svg" width="88" height="88" alt="deictic">
  </a>
</p>

<h1 align="center">deictic</h1>

<p align="center">Point at an element in your running app and leave a task about it for your agent.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/deictic"><img src="https://img.shields.io/npm/v/deictic?color=12b358" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/deictic"><img src="https://img.shields.io/npm/dm/deictic?color=12b358" alt="npm downloads"></a>
  <a href="https://github.com/gkurt/deictic/actions/workflows/ci.yml"><img src="https://github.com/gkurt/deictic/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/deictic?color=12b358" alt="MIT license"></a>
</p>

<p align="center">
  <a href="https://gkurt.com/deictic/">Website</a> ·
  <a href="https://gkurt.com/deictic/example/">Playground</a> ·
  <a href="API.md">API</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

## What

Hold **Alt** and point: the element is outlined with its tag and the file and line that rendered it. **Alt-click**,
say what should change, and attach a screenshot to draw on, a screen recording or a voice note.

The task goes to a [Vercel Board](https://vercel.com/docs/board), for you, a teammate or an agent to work.

## Why

- **No describing where.** "The second button in the header on the pricing page" becomes `src/Header.tsx:12:5`.
  Every task carries the element's place in the source, the page and the viewport.
- **Show, don't type.** Draw on a screenshot, record the bug as it happens, or just say it.
- **Agents pick it up.** A bundled skill watches the board and works each task as it arrives.
- **Nothing in production.** It runs in your dev server only. A build has none of it.
- **Any JSX.** Vite, Next.js, webpack, Rspack, Astro and Bun, server components too.

## How

In your project:

```bash
npx deictic init
```

It installs deictic and what its plugins use with your package manager, adds it to your bundler's config, and offers
to add the agent skill. Or by hand, install it with what its plugins use:

```bash
npm install -D deictic @vercel/board rrweb rrweb-player rrweb-snapshot playwright-core \
  @rrweb/rrweb-plugin-console-record @rrweb/rrweb-plugin-network-record
```

Add it to your bundler:

```ts
// vite.config.ts
import { recommended } from 'deictic/recommended';
import { deictic } from 'deictic/vite';

export default defineConfig({
  plugins: [react(), deictic({ plugins: recommended() })],
});
```

Next.js, webpack, Rspack, Astro and Bun are [in the API](API.md#bundlers). A plugin whose packages aren't installed
says so as the dev server starts, with the command that installs them.

Start your dev server and Alt-click something. Tasks go to a board the dev server starts on your machine, with
nothing to set up: `http://127.0.0.1:4100/`.

To have your agent work them, add the skill (if `init` didn't) and mention `/deictic`:

```bash
npx skills add gkurt/deictic
```

### Options

Each plugin takes its options under its name, and `false` leaves one out:

```ts
deictic({
  shortcut: { modifiers: ['Control', 'Shift'] }, // instead of Alt
  plugins: recommended({
    tasks: { channel: 'ui', labels: { team: 'web' } },
    screenshots: { maskAllInputs: true },
    voice: false,
  }),
});
```

[API.md](API.md) has the rest: your team's board, masking, every plugin's options, and writing a plugin of your own.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
