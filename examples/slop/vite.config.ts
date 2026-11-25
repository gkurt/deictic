import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { deicticRecommended } from 'deictic/recommended';
import { tailwind } from 'deictic/tailwind';
import { deictic } from 'deictic/vite';
import { defineConfig } from 'vite';

// A page to unslop: everything deictic has, so a task can carry a shot, marks, a recording with its console and
// network, or a voice note. Its own port, beside the site and the other examples.
export default defineConfig({
  plugins: [deictic({ plugins: [...deicticRecommended(), tailwind({ css: 'src/index.css' })] }), react(), tailwindcss()],
  server: { port: 5184 },
});
