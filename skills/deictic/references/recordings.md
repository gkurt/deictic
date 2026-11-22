# Recordings and voice

A recording is rrweb's events of the page, kept as JSON (`Kept`): `page`, `viewport`, `colorScheme`, `startedAt`,
`duration` in ms, `events`, and `voice`, the clips the mic made while recording (`{ id, at, duration }`, `at` from the
start). The person's marks are custom events tagged `deictic.annotations` (`annotations`, each `{ shape, color }`,
in page coordinates: CSS pixels from the document's top left), one at the start and one at each change;
`deictic.end` marks where it stopped. Times below are from the recording's start.

A recording may cross pages: the person reloaded, or followed a link, and it went on. `page` is where it started, which
is the page with the task's element; each page it went to is a `page` line in the timeline, and what follows happened
there. A mic that was on makes a clip per page.

Where the project loads the `logs` and `network` plugins, the recording has rrweb's own plugin events too (type 6):

- `rrweb/console@1`: what the page logged, and the errors nothing caught (`level`, `payload`, each argument as JSON,
  and `trace`, where from). `console.<level>` lines in the timeline, at the moment they happened, so an error sits
  right after the click that caused it, with where it came from under a warning or an error.
- `rrweb/network@1`: the page's requests (`requests`, each with its `name`, the URL, `status`, `duration`, and where
  the project asked for them `method`, headers and bodies). `request` lines in the timeline, as each ended. Secrets
  were blanked to `***` before it was kept, so a `***` is not what the page sent. `--json` has the whole request.

Both only from when the recording started. The replay page lists them beside the page, for a person; `&bare` (what
`frame.mjs` opens) is the page alone. A `<canvas>` is recorded as pictures of it, a few a second. A route change with no load (a router's) is a `page` line too, from a
custom event tagged `deictic.page` (`href`).

A task attaches each recording as `recording-<id>.json` and its clips as `voice-<id>.webm`; the dev server keeps
them under `.deictic/recordings` and `.deictic/voice` too. Every script takes the task's ID.

## The timeline

```bash
node <skill>/scripts/recording.mjs 68      # --nth 2 for a task's second recording, --json for data
```

```
 0:00.0  page         http://localhost:5180/ at 1706×870
 0:02.6  click        <button> "Choose" at src/App.tsx:9:7 at (893,416) in the viewport
 0:04.1  voice        clip 0mwp5fq5s03-202aea8a, 0:06.8 long, until 0:10.8
 0:09.0  marks        + pen stroke over (664,539)–(982,772)
 0:10.8  end          recording stopped
```

Clicks and typing name the element and the nearest source place deictic marked. Marks say what was drawn and where
(a box or a pen stroke around something is pointing at it); the notes' text is quoted.

## Frames

```bash
node <skill>/scripts/frame.mjs 68                  # just after each change to the marks, and the end
node <skill>/scripts/frame.mjs 68 --at 4.7 --at 9  # at seconds; --every 2 for a contact sheet; --out <dir>
```

PNGs at the recorded viewport, from the dev server's replay page, so the dev server must be running (`--base <url>`
if it isn't where the recording was made) and the project needs `playwright-core` or `playwright`. Look at them.

Without Playwright, open the replay in a browser tool: the task's replay URL with `?t=<seconds>` opens it paused
there, marks drawn over it.

## Voice

```bash
node <skill>/scripts/voice.mjs 68                 # speech in each clip, in the recording's time
node <skill>/scripts/voice.mjs 68 --wav <dir>     # and each clip as 16 kHz mono WAV
```

```
clip 0mwp5fq5s03-202aea8a (in recording 0mwp5fq5y00-71749b04, from 0:04.1), 0:06.5 long
   0:04.7 –  0:08.8  speech
   0:09.3 –  0:09.8  speech
```

Needs ffmpeg. Line it up with the timeline: what was on screen, clicked or drawn while they spoke is what they're
talking about. `--noise -45` finds quieter speech; `--gap 0.2` splits on shorter pauses.

## What was said

`transcribe.mjs` runs Whisper on this machine (transformers.js), with each stretch's time in the recording:

```bash
node <skill>/scripts/transcribe.mjs 68             # --language tr when they don't speak English; --json for data
```

```
clip 0mwp5fq5s03-202aea8a (in recording 0mwp5fq5y00-71749b04, from 0:04.1):
  0:04.1 –  0:09.1  But let's do something about this.
```

It needs setting up once, and **that is the person's call, not yours**. When a task has voice and the script says
it isn't set up, ask before anything else, in one message:

> This task has a voice note. I can transcribe it on this machine with Whisper: a one-time download of about
> 550 MB (transformers.js with ONNX Runtime, ~470 MB, and the model, ~77 MB) into `~/.cache/deictic/transcribe`, outside the project. After that,
> audio never leaves the machine. Set it up?

- **Yes**: `node <skill>/scripts/transcribe.mjs --setup`, then transcribe. `--model small` (~250 MB more) hears
  better, and `tiny` is smaller; each is a download of its own, so ask again before one.
- **No**: don't ask again this session. Work from the timeline, the frames and `voice.mjs`'s times, and if the
  words matter, reply on the task asking what they said, quoting the times.

Never send the audio to a service outside the machine unless the person asks for that.
