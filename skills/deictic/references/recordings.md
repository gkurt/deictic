# Recordings and voice

Each takes the task's ID; `--help` has the rest.

- `npx deictic recording 68`: the timeline. Clicks and typing name the element and its source line, marks say what
  was drawn, and with the project's `logs` and `network` plugins there's the console and the requests. A recording
  may cross pages: each is a `page` line. To find what went wrong: `--problems`, then `--around <seconds>`.
- `npx deictic frame 68 --at <seconds>`: a PNG of the page at that moment, marks drawn. Needs the dev server.
- `npx deictic voice 68`: when they spoke, in the recording's time. What was on screen then is what they mean.
- `npx deictic transcribe 68`: what they said. Its first run says what it downloads: ask the person before
  `--setup`, and if they say no, don't ask again this session.

Never send the audio off the machine unless the person asks.
