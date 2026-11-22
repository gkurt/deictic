---
packages:
  'deictic': minor
---

### A task goes in wherever the page's element isn't found in its file

It used to be refused, with "the file changed since the page loaded" even where it hadn't. A plugin's `read` and
`apply` now get the `Source` or the `Refusal` saying why there's none, to throw where they need it: only text edits
are refused without it.

### An element whose column is off is found by its line

Where its line has only one of its tag. Otherwise the problem says what the line has, not that the file changed.
