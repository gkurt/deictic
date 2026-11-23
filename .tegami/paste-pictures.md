---
packages:
  'deictic': minor
---

### Paste a picture into the composer

A picture pasted into the Task tab's composer or a reply's, or dropped on it, is attached as a screenshot, which its
chip's lightbox offers to draw on.

### The tool panel keeps the capture tools together

Screenshot, Record, the mic and Task sit side by side at the end of the tool panel, after the drawing tools. A plugin
puts its group in a section with `tools.add(group, { section })`: groups of one section sit together, with no line
between them, after the groups of none, and `last` puts one at its section's end. The gap after Record is gone.

### Attachments keep one size

Every attachment chip, in a composer and in the drawer, is one height, and a picture's thumbnail one size whatever
its shape: nothing moves as one is attached or as its picture loads.
