/**
 * The replay page, `replay/<id>`: rrweb's own player (`rrweb-player`), its timeline, speeds, skipping idle
 * stretches and fullscreen, sized to the window, with what it doesn't do drawn over it:
 *
 * - The page shows in the colour scheme it was recorded in, whatever the viewer's: the replay's iframe
 *   answers `prefers-color-scheme` as the viewer's browser does, so the recorded CSS's queries are rewritten
 *   before it's replayed, the recorded scheme's to always match and the other's never.
 * - The marks drawn while recording come as custom events, an SVG in page coordinates each; they're drawn
 *   over the replay in the player's own scaled wrapper, moved with its scroll, rather than into its document,
 *   which the replayer rebuilds. Each is a marker on the timeline.
 * - The voice clips play in step, at the player's speed. A recording with voice starts paused, as a browser
 *   plays sound only after a click.
 *
 * `?t=<seconds>` opens it paused there, and `&bare` without the controls at the recorded size, 1:1, for a
 * screenshot; `?embed` is it filling a frame, with no header of its own (the lightbox's); `body[data-ready]` says
 * it's in place.
 */
import { MARKS } from './marks.ts';

export const REPLAY = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recording · deictic</title>
<link rel="stylesheet" href="../player.css">
<style>
  :root { color-scheme: dark; --accent: #12b358; }
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; background: #18181b; color: #fafafa; font: 13px/1.4 system-ui, sans-serif; }
  header { display: flex; gap: 10px; align-items: center; padding: 10px 16px; border-bottom: 1px solid #3f3f46; }
  header a { color: #a1a1aa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  main { flex: 1; display: flex; justify-content: center; align-items: flex-start; padding: 16px; }
  body.bare header { display: none; }
  body.bare main { padding: 0; }
  body.embed header { display: none; }
  body.embed main { padding: 0; }
  body.embed #main .rr-player { box-shadow: none; border-radius: 0; }
  #marks { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 3; }
  #marks svg { position: absolute; left: 0; top: 0; overflow: visible; }
  .problem { color: #f87171; padding: 16px; }
  /* rrweb-player, in the dark of the rest of deictic. Its rules repeat Svelte's scoping class, so these start
     from #main, which outweighs any number of classes. */
  #main .rr-player { background: #27272a; box-shadow: 0 12px 32px rgb(0 0 0 / 0.5); border-radius: 8px; overflow: hidden; }
  body.bare #main .rr-player { box-shadow: none; border-radius: 0; }
  #main .rr-player .rr-player__frame { background: #fff; }
  #main .rr-player .rr-controller { background: #18181b; border-top: 1px solid #3f3f46; border-radius: 0; }
  #main .rr-player .rr-timeline__time { color: #a1a1aa; font: 12px ui-monospace, monospace; }
  #main .rr-player .rr-progress { background: #3f3f46; border-color: #18181b; }
  #main .rr-player .rr-progress__step { background: color-mix(in srgb, var(--accent) 45%, transparent); }
  #main .rr-player .rr-progress__handler { background: var(--accent); }
  #main .rr-player .rr-controller__btns button { color: #e4e4e7; }
  #main .rr-player .rr-controller__btns button:disabled { color: #52525b; }
  #main .rr-player .rr-controller__btns button svg { fill: currentColor; }
  #main .rr-player .rr-controller__btns button.active { color: #04130b; background: var(--accent); }
  #main .rr-player .rr-controller__btns button:active { background: color-mix(in srgb, var(--accent) 60%, transparent); }
  #main .rr-player .switch .label { color: #e4e4e7; }
  #main .rr-player .switch.disabled .label { color: #52525b; }
  #main .rr-player .switch label:before { background: #52525b; }
  #main .rr-player .switch input:checked + label:before { background: var(--accent); }
</style>
<header>
  <strong>Recording</strong>
  <a id="page" target="_blank" rel="noreferrer"></a>
</header>
<main id="main"></main>
<script src="../player.js"></script>
<script>
  const params = new URLSearchParams(location.search);
  const bare = params.has('bare');
  const embed = params.has('embed');
  if (bare) document.body.classList.add('bare');
  if (embed) document.body.classList.add('embed');
  const id = location.pathname.split('/').at(-1);
  fetch('../recording/' + id).then((r) => (r.ok ? r.json() : r.text().then((t) => Promise.reject(new Error(t))))).then((kept) => {
    const scheme = kept.colorScheme ?? 'light';
    const events = JSON.parse(
      JSON.stringify(kept.events).replace(/\\(\\s*prefers-color-scheme\\s*:\\s*(light|dark)\\s*\\)/g, (_, s) =>
        s === scheme ? '(min-width: 0px)' : '(max-width: 0px) and (min-width: 1px)',
      ),
    );
    page.textContent = kept.page;
    page.href = kept.page;

    // A recording with the mic starts paused: a browser plays sound only after a click, which Play is.
    const clips = (kept.voice ?? []).map((c) => ({ ...c, audio: Object.assign(new Audio('../../voice/clip/' + c.id), { preload: 'auto' }) }));
    const t = Number.parseFloat(params.get('t') ?? '');
    // The player's frame, at most the window's room, the controls (80px) under it; 1:1 when bare.
    const size = () => bare
      ? { width: kept.viewport.width, height: kept.viewport.height }
      : embed
      ? { width: innerWidth, height: innerHeight - 80 }
      : { width: Math.min(kept.viewport.width, innerWidth - 32), height: Math.min(kept.viewport.height, innerHeight - 90 - 80 - 16) };
    const Player = rrwebPlayer.default ?? rrwebPlayer.Player ?? rrwebPlayer;
    const player = new Player({
      target: main,
      props: {
        events,
        ...size(),
        autoPlay: !Number.isFinite(t) && clips.length === 0,
        showController: !bare,
        speedOption: [1, 2, 4, 8],
        tags: { ${JSON.stringify(MARKS)}: '#12b358' },
        inactiveColor: '#3f3f46',
        mouseTail: false,
      },
    });
    addEventListener('resize', () => { player.$set(size()); player.triggerResize(); });
    const replayer = player.getReplayer();
    const total = player.getMetaData().totalTime;

    // The marks as they were at this point: the latest custom event's, in the player's scaled wrapper, moved with the replay's scroll.
    const marks = Object.assign(document.createElement('div'), { id: 'marks' });
    replayer.wrapper.append(marks);
    replayer.on('custom-event', (e) => { if (e.data.tag === ${JSON.stringify(MARKS)}) marks.innerHTML = e.data.payload.svg; });

    let playing = false;
    player.addEventListener('ui-update-player-state', (e) => { playing = e.payload === 'playing'; });
    const follow = () => {
      const win = replayer.iframe.contentWindow;
      if (win) marks.style.transform = 'translate(' + -win.scrollX + 'px,' + -win.scrollY + 'px)';
      const now = Math.min(replayer.getCurrentTime(), total);
      const speed = replayer.config.speed ?? 1;
      // Each clip plays while the replay is inside it, at its speed, kept within a few frames of the replay's time.
      for (const c of clips) {
        const into = now - c.at;
        if (!playing || into < 0 || into >= c.duration) { if (!c.audio.paused) c.audio.pause(); continue; }
        if (c.audio.playbackRate !== speed) c.audio.playbackRate = speed;
        if (Math.abs(c.audio.currentTime * 1000 - into) > 250 * speed) c.audio.currentTime = into / 1000;
        if (c.audio.paused) c.audio.play().catch(() => {});
      }
      requestAnimationFrame(follow);
    };
    follow();

    if (Number.isFinite(t)) player.goto(Math.min(Math.max(0, t * 1000), total), false);
    document.body.dataset.ready = '';
  }).catch((e) => { document.querySelector('main').innerHTML = '<p class="problem"></p>'; document.querySelector('.problem').textContent = e.message; });
</script>
</html>
`;
