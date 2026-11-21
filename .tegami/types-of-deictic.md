---
packages:
  'deictic': patch
---

### `deictic`'s types are its own again

`import type { ServerPlugin } from 'deictic'` found no such export: the build had put a shared chunk, exported under one-letter names, where the entry's types go.
