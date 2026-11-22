import { defineConfig } from 'tsdown';

// One entry per export in package.json. Vite and Node built-ins stay external.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    vite: 'src/vite.ts',
    webpack: 'src/webpack.ts',
    next: 'src/next.ts',
    bun: 'src/bun.ts',
    astro: 'src/astro.ts',
    loader: 'src/loader.ts',
    'client/index': 'src/client/index.ts',
    'tailwind/index': 'src/plugins/tailwind/index.ts',
    'tailwind/client': 'src/plugins/tailwind/client.ts',
    'tasks/index': 'src/plugins/tasks/index.ts',
    'tasks/client': 'src/plugins/tasks/client.ts',
    'screenshots/index': 'src/plugins/screenshots/index.ts',
    'screenshots/client': 'src/plugins/screenshots/client.ts',
    'screenshots/dom': 'src/plugins/screenshots/dom.ts',
    'screenshots/rrweb': 'src/plugins/screenshots/rrweb.ts',
    'annotations/index': 'src/plugins/annotations/index.ts',
    'annotations/client': 'src/plugins/annotations/client.ts',
    'recordings/index': 'src/plugins/recordings/index.ts',
    'recordings/client': 'src/plugins/recordings/client.ts',
    'voice/index': 'src/plugins/voice/index.ts',
    'voice/client': 'src/plugins/voice/client.ts',
    'logs/index': 'src/plugins/logs/index.ts',
    'logs/client': 'src/plugins/logs/client.ts',
    'network/index': 'src/plugins/network/index.ts',
    'network/client': 'src/plugins/network/client.ts',
    'recommended/index': 'src/plugins/recommended/index.ts',
  },
  format: 'esm',
  platform: 'node',
  // `@types/bun` declares the `bun` module ambiently, which the declaration bundler can't follow. A plugin's inferred
  // type names `deictic` itself (`import("deictic").ServerPlugin`, as its `declare module 'deictic'` does): left as
  // written, since followed it's the last build's `dist/index.d.ts`, or nothing in a fresh checkout.
  deps: { neverBundle: ['bun', 'deictic'] },
  // `.js`, as package.json names them: the package is `type: module`.
  fixedExtension: false,
  // Shared chunks keep their names from build to build, so a dev server running on `dist` (the site's, the
  // examples') goes on resolving the modules it loaded before a rebuild, rather than failing on a name gone.
  hash: false,
  // In a folder of their own: with no hash, the chunk of `src/index.ts`'s types would take the entry's name,
  // `index.d.ts`, and `deictic`'s types would be a chunk's, exported under one-letter names.
  outputOptions: { chunkFileNames: 'shared/[name].js' },
  // And `dist` isn't emptied first: a running dev server would reload its modules while they're gone and
  // report each as missing. `prepack` cleans, so nothing stale is published.
  clean: false,
  dts: true,
  sourcemap: true,
});
