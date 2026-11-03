import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { annotations } from 'deictic/annotations';
import { recordings } from 'deictic/recordings';
import { screenshots } from 'deictic/screenshots';
import { tailwind } from 'deictic/tailwind';
import { tasks } from 'deictic/tasks';
import { deictic } from 'deictic/vite';
import { voice } from 'deictic/voice';
import { defineConfig } from 'vite';

import { localBoard } from './board.ts';

// The homepage, and a playground to try the plugins on. deictic runs on both.
export default defineConfig({
  // GitHub Pages serves it under the repository's name (`BASE=/deictic/`, set by the deploy workflow).
  base: process.env.BASE ?? '/',
  plugins: [
    react({ compiler: true }),
    tailwindcss(),
    localBoard(),
    deictic({ plugins: [tasks({ labels: { kind: 'ui' } }), screenshots(), annotations(), recordings(), voice(), tailwind()] }),
  ],
  // Its own port, so it runs beside the examples' dev servers on Vite's default.
  server: { port: 5180 },
  build: {
    rolldownOptions: {
      input: { home: resolve(import.meta.dirname, 'index.html'), example: resolve(import.meta.dirname, 'example/index.html') },
    },
  },
});
