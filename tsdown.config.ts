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
  },
  format: 'esm',
  platform: 'node',
  // `@types/bun` declares the `bun` module ambiently, which the declaration bundler can't follow.
  deps: { neverBundle: ['bun'] },
  // `.js`, as package.json names them: the package is `type: module`.
  fixedExtension: false,
  // Shared chunks keep their names from build to build, so a dev server running on `dist` (the site's, the
  // examples') goes on resolving the modules it loaded before a rebuild, rather than failing on a name gone.
  hash: false,
  dts: true,
  sourcemap: true,
});
