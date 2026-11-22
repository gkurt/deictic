---
packages:
  'deictic': patch
---

### `deictic watch` follows a restarted board wherever it comes back

- A board started again on another port is followed there, instead of the watch going quiet while it asks the old one.
- Every restart says the board went away and that it's back, with the reason in the watch's own line, not the board CLI's raw error.
- After a restart the watch picks up from the last event it heard, and no longer lists the ready tasks again, which could repeat a task already done.
