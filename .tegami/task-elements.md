---
packages:
  'deictic': minor
---

### A task's elements are attached, and there can be several

The element the popup is on is a chip in the Task tab's composer, with what else is attached. The crosshair button
attaches another: the next press on the page picks it. A task about several is listed and pinned at its first, names
the rest as `deictic.also.N` (`src/Nav.tsx:4:7 <a>`, each one's HTML in `element.N.html`), and has them all outlined
in its screenshot. With every element taken out, the task is about the page, and has no `deictic.at`. `deictic task`
says both.

### An element is named by its component

The caption while pointing, the popup's bar and a pin's card say the component whose JSX has the element, with React
in development: `<Plan> <li>`, or `<Badge>` alone for the only element a component writes. Without, it's the tag, as
before.

### A panel can apply on another element: `apply(op, on)`

For an op that's about another element than the popup's. The model answered is then that element's.
