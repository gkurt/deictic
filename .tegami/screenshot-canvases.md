---
packages:
  'deictic': patch
---

### A screenshot shows what the page's canvases drew

The `rrweb()` renderer drew every `<canvas>` blank, WebGL's and 2D's alike. A shot now has each canvas's picture, a WebGL canvas's too, which keeps its drawing buffer unless the page says otherwise.

### A screenshot no longer says SCRIPT_PLACEHOLDER

A page with a `<script>` in its body had the text SCRIPT_PLACEHOLDER in the `rrweb()` renderer's shot, where rrweb keeps the script.
