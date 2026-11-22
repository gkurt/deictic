# Working a task

`vb` is `node <skill>/scripts/vb.mjs` (the project's own CLI, on the dev server's board), with `BOARD_PROFILE` set
to your name.

## 1. Claim and read

```bash
vb tasks claim 68 --lease 30m
node <skill>/scripts/task.mjs 68        # --out <dir> downloads the attachments too
```

A task's text is what the person typed. Where there's more that no label holds, a `---` and:

- What's attached and needs saying: the marks on a screenshot and what the notes say; a recording, its length, its
  voice clips and its replay URL; a voice note's length.
- `Source:` the chain of source it rendered through, from its own line out:
  `src/ui/label.tsx:6 ← ParticipantsField (src/ParticipantsField.tsx:20) ← WorkflowPanel`. Each one after the first
  is the component whose JSX has the one before, three at most: its line is the element of its own around that
  use, so the component's tag is at or just under it, and a name alone (`WorkflowPanel`) is a component with no
  element of its own around it: find its file by the name. When `deictic.at` is a shared component
  (`ui/label.tsx`, seven of them on the page), the change is rarely there: it's at the next one, or the one after.
  Where the page isn't React in development, the chain is `file:line`s only: the files of the elements around it,
  which miss a component that wraps what it uses only in other components. No line when it all came from one file.
- Sometimes `Pointed at, inside it:` a path and HTML: the person pointed at markup inside the element that no line
  marks (a dependency's, or a shadow root's). That part is what they mean; find it by its classes. On deictic's
  own `/internal/` page it's deictic's popup, so the fix is in deictic's client code, not the page.

The short facts are labels, which `task.mjs` prints (or `vb read 68 --json`):

| Label              | Value                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `deictic.project`  | The project: its `package.json`'s name, or what the config says. On a shared board, work only your project's                                     |
| `deictic.at`       | `src/pages/home.tsx:42:9`: the element's opening tag, from the dev server's root (the folder its `.deictic/` is in), in UTF-16 columns from 1    |
| `deictic.file`     | `src/pages/home.tsx`: that file alone, to list every task about it (`vb tail --label`)                                                           |
| `deictic.tag`      | `p`                                                                                                                                              |
| `deictic.line`     | The opening tag's first line as the task saw it, up to 256 characters                                                                            |
| `deictic.page`     | The page's path                                                                                                                                  |
| `deictic.url`      | The page's whole URL (in the text instead when it's over 256 characters)                                                                         |
| `deictic.viewport` | `1280x800`, so you can look at the page as they did                                                                                              |
| `deictic.count`    | How many elements on the page that line renders                                                                                                  |
| `deictic.position` | `87,387`: the element's `x,y` in the screenshot, in CSS pixels from its top left; the PNG may have twice as many (its width over the viewport's) |
| `deictic.size`     | `138x32`: its width and height there                                                                                                             |

`deictic.position` and `deictic.size` are there with one screenshot; with several, each one's place is in the text.
You rarely need them for a screenshot taken with the task: the element is outlined in it, in green dashes, which
the text says (`the element outlined in dashes`). One the person annotated has their marks and no outline. The source isn't in the task: read the file.

Attached to most tasks is `element.html`: the element's HTML when the task was left, masked as the screenshots
are. Don't read it by default; download it (`vb download <attachment> element.html`) when the task and the
screenshot don't settle which of several alike is meant, or you can't open the page as the person had it. Its text
and classes say what the page showed, and a child's `data-deictic` is the line that wrote it. Not there when the
person unticked it, or the config says `tasks({ html: false })`.

`task.mjs` says whether that line still reads as the task saw it, or where it moved, and lists the other open tasks
about the same page: tasks left within a minute of each other are often one change (three about one page's
layout). Read them all before you start; claim and work them one after another, and say in each one's result which
others the change answers.

## 2. Understand what they want

- The typed text is the request. When it's short ("fix this", "solve it") or stands in for none typed ("See the
  recording"), the attachments carry it: look at every screenshot, and for a recording, its timeline, frames and voice ([recordings.md](recordings.md)).
- A screenshot is a PNG: download it to a file's path, not a folder's (`vb download <attachment> shot.png`, or
  all of a task's with `task.mjs 68 --out <dir>`), and look at it. The element is outlined in green dashes, unless the person drew on the shot, and
  the person's marks are drawn in; the notes are in the task's text too.
- The element is one place; what the person means may be its component, its parent, a sibling (the next card in a
  row), or every element that line renders (a list item). The marks and the words decide.
- To see it live, open the page at the recorded viewport, find the element with
  `document.querySelector('[data-deictic="src/pages/home.tsx:42:9"]')`, and read its computed style.
- `deictic.url` is the page as the person had it: their host, their account, their data. You often can't open it.
  Use the app as the project's instructions say to (a local dev server, a test account), and get to the same
  screen by its path (`deictic.page`) and what `element.html` and the screenshot show. Where the test account
  has nothing like it (no workflow with participants, an empty team), make that data if the app lets you, and
  otherwise change the source from the HTML and the screenshot, and say in the result what you couldn't see live.
  Never ask for, or use, the person's own session.
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
- A change the page can't show (copy that comes from data, behaviour after a click), or one you couldn't open the
  page for: say how you checked it, and what you didn't.

## 4. Finish

```bash
vb tasks complete 68 "Bolded the card titles: src/pages/home.tsx:58 (font-semibold), all three cards"
```

The result is what the person reads first: what changed, where, and anything you decided for them. A board's
record of a task names who asked for it and, while it's claimed, who holds it, but not who completed it (that's
only in its events), so `vb read` shows the person's name beside your result. Other endings:

- `vb tasks release 68`: you can't work it after all; it's ready again for someone else.
- `vb tasks fail 68 "<why>"`: it can't be done as asked; say what would make it possible.
- `vb reply 68 "…"`: a note on it without changing its state.

Then go back to the watch (start it again if it ended while you worked), and say in one line which task you closed
and what changed.
