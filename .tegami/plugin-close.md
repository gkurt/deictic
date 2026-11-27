---
packages:
  'deictic': minor
---

### A plugin's setup can leave something to run as the dev server closes, with context.onClose(callback)

`setup` gets `onClose` on its context: undo there what it did beyond the plugin, a global it set or a watcher it started. Vite and webpack call it as their dev servers close; under Next and Bun the dev server ends with its process.
