import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { recommended } from 'deictic/recommended';
import { tailwind } from 'deictic/tailwind';
import { deictic } from 'deictic/vite';
import { defineConfig } from 'vite';

import { localBoard } from './board.ts';
import { highlighted } from './code.ts';

// The homepage, and a playground to try the plugins on. deictic runs on both.
export default defineConfig({
  // GitHub Pages serves it under the repository's name (`BASE=/deictic/`, set by the deploy workflow).
  base: process.env.BASE ?? '/',
  plugins: [
    react({ compiler: true }),
    tailwindcss(),
    localBoard(),
    highlighted(),
    deictic({ plugins: [...recommended(), tailwind({ css: 'src/site.css' })] }),
  ],
  // Its own port, so it runs beside the examples' dev servers on Vite's default.
  server: { port: 5180 },
  build: {
    rolldownOptions: {
      input: { home: resolve(import.meta.dirname, 'index.html'), example: resolve(import.meta.dirname, 'example/index.html') },
    },
  },
});
