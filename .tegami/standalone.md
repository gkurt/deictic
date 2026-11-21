---
packages:
  'deictic': minor
---

### `standalone`: deictic on a deployed page, for a demo

`deictic/vite` takes `standalone`, a module of the page's that answers the overlay's requests where there's no dev server: with it, a build is marked and has the overlay. Without it, a build has nothing of deictic, as before. `replayPage()` from `deictic/recordings` is the replay page to publish beside such a build.
