import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { tailwind } from 'deictic/tailwind';
import { tasks } from 'deictic/tasks';
import { deictic } from 'deictic/vite';
import { defineConfig } from 'vite';

// Tasks go to a board the dev server starts on this machine (`.deictic/board`), or the one BOARD_URL names.
export default defineConfig({
  plugins: [react({ compiler: true }), tailwindcss(), deictic({ plugins: [tasks(), tailwind({ css: 'src/index.css' })] })],
});
