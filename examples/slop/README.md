# Synergify AI

A landing page to unslop: every AI-generated landing page at once, with the bad design that comes with them. Point at
what's wrong with deictic, leave a task, and let an agent fix it.

```sh
bun run slop    # build deictic, then this page on http://localhost:5184
```

It has every plugin of `recommended()` and Tailwind's, so a task can carry a shot, marks, a recording (with its console
and network) or a voice note. Reset it to its sloppy self with `git checkout examples/slop`.

## What's wrong with it

Some ideas for tasks, by what shows them best. Not exhaustive: the whole page is the problem.

### Point at it

- The announcement bar pulses forever, in a rainbow, with four 🎉.
- The nav has ten links, the `AI 🔥` one sits lower than the rest, and nothing wraps on a narrow window.
- The hero's paragraph is light gray on white and as wide as the window.
- Three hero buttons, three different shapes, sizes and radii; the small print under them is near invisible.
- The `[Dashboard Preview]` is a placeholder, floating and glowing.
- "Trusted by" logos are placeholder names in two fonts, at 30% opacity.
- Feature cards: the third is a yellow square with left-aligned text; the rest grow and tilt on hover. "Seamlessly" four
  times in one sentence.
- The stats' labels are gray-700 on gray-950, the footnote unreadable.
- How It Works counts Step 1, Step 2, Step 2.
- Testimonials are uneven heights, one is a wall of text, the names are "Sarah J." and friends.
- Pricing's ✅ ✔️ ✓ mix, four button labels for one action, buttons at four heights, the popular card scaled into its
  neighbours, the badge bouncing.
- The footer's text is gray-300, its social links emoji, its year 2024.

### Draw on it

- Section headings change typeface: serif, sans, mono, black, extrabold.
- Too many gradients: circle the ones worth keeping.

### Record it

- The Monthly / Yearly toggle says "SAVE 20%!" and changes no price.
- Opening one FAQ opens them all.
- The email form takes anything, posts to a route that doesn't exist and says "Oops!" (the recording has the 404 and
  the console error).
- The newsletter popup comes 8 seconds in (once per tab), and its close button is tiny gray.
- The cookie banner's Reject is a 10px gray word, and the chat bubble bounces on top of the banner.

### Say it

- The copy: "In today's fast-paced digital landscape", "It's not just a tool — it's a paradigm shift", "leverage",
  "unlock", "supercharge", em dashes and emoji everywhere. Ask for plain words.
