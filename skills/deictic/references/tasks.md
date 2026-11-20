# Working a task

## 1. Claim and read

```bash
vb tasks claim 68 --lease 30m
node <skill>/scripts/task.mjs 68        # --out <dir> downloads the attachments too
```

A task's text is what the person typed. Where there's more that no label holds, a `---` and:

- What's attached and needs saying: the marks on a screenshot and what the notes say; a recording, its length, its
  voice clips and its replay URL; a voice note's length.
- Sometimes `Pointed at, inside it:` a path and HTML: the person pointed at markup inside the element that no line
  marks (a dependency's, or a shadow root's). That part is what they mean; find it by its classes. On deictic's
  own `/internal/` page it's deictic's popup, so the fix is in deictic's client code, not the page.

The short facts are labels, which `task.mjs` prints (or `vb read 68 --json`):

| Label              | Value                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `deictic.project`  | The project: its `package.json`'s name, or what the config says. On a shared board, work only your project's                                  |
| `deictic.at`       | `src/pages/home.tsx:42:9`: the element's opening tag, from the dev server's root (the folder its `.deictic/` is in), in UTF-16 columns from 1 |
| `deictic.tag`      | `p`                                                                                                                                           |
| `deictic.line`     | The opening tag's first line as the task saw it, up to 256 characters                                                                         |
| `deictic.page`     | The page's path                                                                                                                               |
| `deictic.url`      | The page's whole URL (in the text instead when it's over 256 characters)                                                                      |
| `deictic.viewport` | `1280x800`, so you can look at the page as they did                                                                                           |
| `deictic.count`    | How many elements on the page that line renders                                                                                               |
| `deictic.box`      | `x,y,width,height` of the element in the screenshot, in CSS pixels from its top left                                                          |

`deictic.box` is there with one screenshot; with several, each one's place is in the text. The source isn't in the
task: read the file. For the element as it rendered, open the page.

`task.mjs` says whether that line still reads as the task saw it, or where it moved.

## 2. Understand what they want

- The typed text is the request. When it's short ("fix this", "solve it"), the attachments carry it: look at
  every screenshot, and for a recording, its timeline, frames and voice ([recordings.md](recordings.md)).
- A screenshot is a PNG: download it (`vb download <attachment> <dir>`) and look at it. Marks are drawn in;
  the notes are in the task's text too.
- The element is one place; what the person means may be its component, its parent, a sibling (the next card in a
  row), or every element that line renders (a list item). The marks and the words decide.
- To see it live, open the page at the recorded viewport, find the element with
  `document.querySelector('[data-deictic="src/pages/home.tsx:42:9"]')`, and read its computed style.
- Voice carries the request more often than not: transcribe it ([recordings.md](recordings.md#what-was-said)),
  which asks the person once before setting up.
- Still unsure: ask, quoting what you understood and the times you mean.

  ```bash
  vb reply 68 "Do you mean the card's title should be bolder, or the whole card? (circled at 0:09)"
  vb tasks block 68 "Asked which part of the card"   # hands it back while they answer
  ```

  Keep watching; their reply shows up there. A hold is lifted by the task's owner: on a board on this machine
  that's you too (`vb tasks unblock 68`, then `vb tasks claim 68`); otherwise ask them to unblock it.

## 3. Change it, then check it

- Edit the source at the place, as the project writes code. Tailwind classes go in the `className` the line shows.
- The dev server's hot update brings the page in line. Look at the page at the task's viewport (a browser tool, or
  a screenshot), compare it with what was asked, and run the project's checks if the change is more than visual.
- A change the page can't show (copy that comes from data, behaviour after a click): say how you checked it.

## 4. Finish

```bash
vb tasks complete 68 "Bolded the card titles: src/pages/home.tsx:58 (font-semibold), all three cards"
```

The result is what the person reads first: what changed, where, and anything you decided for them. Other endings:

- `vb tasks release 68`: you can't work it after all; it's ready again for someone else.
- `vb tasks fail 68 "<why>"`: it can't be done as asked; say what would make it possible.
- `vb reply 68 "…"`: a note on it without changing its state.

Then go back to the watch, and say in one line which task you closed and what changed.
