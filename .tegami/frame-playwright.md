---
packages:
  'deictic': patch
---

### `deictic frame` finds the project's Playwright

`deictic frame` said "No Chromium to launch" with Chromium installed, as `playwright-core` names its exports only on `default` to an `import`. The command now reads them there, and says why each browser failed to launch where none did.
