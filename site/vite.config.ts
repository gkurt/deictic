import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { recommended } from 'deictic/recommended';
import { dom } from 'deictic/screenshots';
import { tailwind } from 'deictic/tailwind';
import { deictic } from 'deictic/vite';
import { defineConfig } from 'vite';

import { highlighted } from './code.ts';
import { replay } from './replay.ts';

// The deployed site has no dev server, and deictic all the same, to try: `standalone` puts it in the build, and
// `src/standalone.ts` answers it in the page. Shots are drawn in the page (`dom()`), as there's no server to render
// one, and a recording's replay is a page the build publishes (`replay.ts`).
const deployed = {
  standalone: 'src/standalone.ts',
  plugins: [...recommended({ screenshots: { renderer: dom() } }), tailwind({ css: 'src/site.css' })],
};

// The homepage, and a playground to try the plugins on. deictic runs on both.
export default defineConfig(({ command }) => ({
  // GitHub Pages serves it under the repository's name (`BASE=/deictic/`, set by the deploy workflow).
  base: process.env.BASE ?? '/',
  plugins: [
    deictic(command === 'build' ? deployed : { plugins: [...recommended(), tailwind({ css: 'src/site.css' })] }),
    react({ compiler: true }),
    tailwindcss(),
    highlighted(),
    replay(),
  ],
  // Its own port, so it runs beside the examples' dev servers on Vite's default.
  server: { port: 5180 },
  build: {
    rolldownOptions: {
      input: { home: resolve(import.meta.dirname, 'index.html'), example: resolve(import.meta.dirname, 'example/index.html') },
    },
  },
}));
