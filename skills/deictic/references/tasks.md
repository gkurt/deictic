# Reading a task

`npx deictic task 68` prints what was asked, where, the page and viewport, the notes drawn, what's attached with the
command to read each, and whether the line still reads as the task saw it.

- **`Source:`** (the `deictic.source` label, after its own place) is the chain the element rendered through, from its
  own line out:
  `src/ui/label.tsx:6 ← ParticipantsField (src/ParticipantsField.tsx:20) ← WorkflowPanel`. When the first is a shared
  component (`ui/label.tsx`), the change is usually at the next one. A name alone is a component to find by name.
- **`Pointed at, inside it:`** is markup inside the element that no line marks (a dependency's): what they mean. Its
  HTML is in the file named beside it. Find it by its classes.
- **`About the spot at x,y`** (the `deictic.point` label): the task is about that point, not the whole element,
  which is only the nearest one the source marks. The point may be outside it. A screenshot taken of the element has
  the point circled.
- **The element is one place**: what they mean may be its parent, a sibling, or every element the line renders. The
  words and the marks decide.
- **`element.html`** is the element as it rendered. Read it only when the task and the screenshot don't settle which
  of several alike is meant, or you can't open the page.
- **The page** (`deictic.url`) is theirs: their host, account and data. Reach the same screen in the app as the
  project says to run it, by its path. Never ask for or use their session. Say in the result what you couldn't see.
- **Still unsure**: `vb reply 68 "<what you understood, and the question>"`, then `vb tasks block 68 "<why>"` while
  they answer.

Other endings: `vb tasks release 68` (someone else can take it), `vb tasks fail 68 "<why, and what would make it
possible>"`.
