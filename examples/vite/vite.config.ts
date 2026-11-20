import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { tailwind } from 'deictic/tailwind';
import { tasks } from 'deictic/tasks';
import { deictic } from 'deictic/vite';
import { defineConfig } from 'vite';

// Tasks go to the board BOARD_URL names: `npx vb serve` runs one on this machine.
export default defineConfig({
  plugins: [react({ compiler: true }), tailwindcss(), deictic({ plugins: [tasks(), tailwind()] })],
});
