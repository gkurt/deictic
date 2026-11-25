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
 * - What the page logged and asked for (rrweb's console and network plugins' events, which its player doesn't
 *   show) is a list beside the replay, where the window has the room: the row the replay is at is lit, a click on
 *   one goes to its moment and shows the rest of it, and each error and failed request is a mark on the timeline.
 * - A recorded canvas is replayed (`UNSAFE_replayCanvas`, which lets the replay's frame run rrweb's own script
 *   to draw it), for a recording that has one.
 *
 * `?t=<seconds>` opens it paused there, and `&bare` without the controls at the recorded size, 1:1, for a
 * screenshot; `?embed` is it filling a frame, with no header of its own (the lightbox's); `body[data-ready]` says
 * it's in place.
 *
 * The plugin's routes serve it, the player and what it plays. A page with no server behind it (a `standalone` build)
 * publishes it as a file instead, `replayPage(sources)`: which recording is `?id=`, and a script of its own says
 * where one is.
 */
import { MARKS, REACT } from './marks.ts';

/** Where the replay page finds what the plugin's routes would serve it, for a page published as a file. */
export interface ReplaySources {
  /** The folder `player.js` and `player.css` are in (`rrweb-player`'s `rrweb-player.umd.min.cjs` and `style.css`), from the page: `..`, the routes', by default. */
  player?: string;
  /**
   * A script, from the page, that sets `globalThis.deicticReplay` before the page asks: `recording(id)` answers the
   * recording (a `Kept`) and `clip(id)` a voice clip's URL, either as a promise. The routes by default.
   */
  source?: string;
}

/** The replay page's HTML: the routes' as it is, or one for a page published as a file. */
export const replayPage = ({ player = '..', source }: ReplaySources = {}) => `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recording · deictic</title>
<link rel="stylesheet" href="${player}/player.css">
<style>
  :root { color-scheme: dark; --accent: #12b358; }
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; background: #18181b; color: #fafafa; font: 13px/1.4 system-ui, sans-serif; }
  header { display: flex; gap: 10px; align-items: center; padding: 10px 16px; border-bottom: 1px solid #3f3f46; }
  header a { color: #a1a1aa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #stage { flex: 1; display: flex; min-height: 0; }
  main { flex: 1; min-width: 0; display: flex; justify-content: center; align-items: flex-start; padding: 16px; }
  body.bare header { display: none; }
  body.bare main { padding: 0; }
  body.embed header { display: none; }
  body.embed main { padding: 0; }
  /* What the page logged and asked for, beside the replay: the window's height, its list scrolling in it. */
  #log { display: none; flex: none; width: 340px; flex-direction: column; border-left: 1px solid #3f3f46; background: #1f1f23; }
  body.logged { height: 100vh; }
  body.logged #log { display: flex; }
  @media (max-width: 899px) { body.logged #log { display: none; } }
  #log .filters { display: flex; gap: 6px; padding: 8px; border-bottom: 1px solid #3f3f46; }
  #log .filters button { padding: 3px 8px; border: 1px solid #3f3f46; border-radius: 6px; background: none; color: #a1a1aa; font: inherit; font-size: 12px; cursor: pointer; }
  #log .filters button[aria-pressed='true'] { color: #fafafa; background: #3f3f46; }
  #log ol { flex: 1; min-height: 0; overflow: auto; margin: 0; padding: 0; list-style: none; font: 12px/1.45 ui-monospace, monospace; }
  #log li { border-bottom: 1px solid #2e2e33; border-left: 2px solid transparent; }
  #log li.ahead { opacity: 0.45; }
  #log li.now { border-left-color: var(--accent); background: #27272a; }
  #log li.warn .label { color: #fbbf24; }
  #log li.bad .label, #log li.bad .text { color: #f87171; }
  #log li > button { display: flex; gap: 8px; align-items: baseline; width: 100%; padding: 5px 8px; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  #log li > button:hover { background: #2e2e33; }
  #log time { flex: none; color: #71717a; }
  #log .label { flex: none; min-width: 4ch; color: #a1a1aa; }
  #log .text { min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  #log li.open .text { display: block; white-space: pre-wrap; }
  #log pre { margin: 0; padding: 2px 8px 8px calc(8px + 6ch + 8px); color: #a1a1aa; font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
  #log.no-console li.console, #log.no-network li.network, #log.no-react li.react, #log.only-bad li:not(.bad) { display: none; }
  #log li.react .label { color: #58c4dc; }
  #log li.react.warn .label { color: #fbbf24; }
  #main .rr-player .rr-progress .slow-mark { position: absolute; top: -3px; width: 3px; height: 10px; margin-left: -1px; border-radius: 1px; background: #fbbf24; pointer-events: none; }
  #main .rr-player .rr-progress .bad-mark { position: absolute; top: -3px; width: 3px; height: 10px; margin-left: -1px; border-radius: 1px; background: #f87171; pointer-events: none; }
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
<div id="stage">
  <main id="main"></main>
  <aside id="log" aria-label="Console and network">
    <div class="filters">
      <button type="button" data-hides="no-console" aria-pressed="true">Console</button>
      <button type="button" data-hides="no-network" aria-pressed="true">Network</button>
      <button type="button" data-hides="no-react" aria-pressed="true" hidden title="React's commits: what rendered, how long it took, and why">React</button>
      <button type="button" data-shows="only-bad" aria-pressed="false" title="Errors, and requests that failed">Problems</button>
    </div>
    <ol></ol>
  </aside>
</div>
<script src="${player}/player.js"></script>${
  source === undefined
    ? ''
    : `
<script src="${source}"></script>`
}
<script>
  const params = new URLSearchParams(location.search);
  const bare = params.has('bare');
  const embed = params.has('embed');
  if (bare) document.body.classList.add('bare');
  if (embed) document.body.classList.add('embed');
  const id = params.get('id') ?? location.pathname.split('/').at(-1);
  // The plugin's routes, unless the page was given a source of its own (\`replayPage\`).
  const from = globalThis.deicticReplay ?? {
    recording: (id) => fetch('../recording/' + id).then((r) => (r.ok ? r.json() : r.text().then((t) => Promise.reject(new Error(t))))),
    clip: (id) => '../../voice/clip/' + id,
  };
  Promise.resolve(from.recording(id)).then(async (kept) => {
    const scheme = kept.colorScheme ?? 'light';
    const events = JSON.parse(
      JSON.stringify(kept.events).replace(/\\(\\s*prefers-color-scheme\\s*:\\s*(light|dark)\\s*\\)/g, (_, s) =>
        s === scheme ? '(min-width: 0px)' : '(max-width: 0px) and (min-width: 1px)',
      ),
    );
    page.textContent = kept.page;
    page.href = kept.page;

    // What the page logged and asked for, where the recording has it (rrweb's console and network plugins' events):
    // a row each, in their order, beside the replay. Not in a bare one, which is the page alone.
    const t0 = events[0].timestamp;
    const clock = (ms) => { const s = Math.max(0, ms) / 1000; return Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0'); };
    // An argument is kept as JSON: a string reads better without its quotes.
    const plain = (arg) => { try { const v = JSON.parse(arg); return typeof v === 'string' ? v : arg; } catch { return arg; } };
    const origin = (() => { try { return new URL(kept.page).origin; } catch { return ''; } })();
    const fields = (title, held) => (held && Object.keys(held).length > 0 ? [title, ...Object.entries(held).map(([k, v]) => '  ' + k + ': ' + v)] : []);
    const rows = [];
    // React's commits, where the recording had them on: a row an entry, slow ones (past a frame) marked.
    const ms = (n) => (n === undefined ? '' : (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ms');
    for (const e of events) {
      if (e.type !== 5 || bare || e.data.tag !== ${JSON.stringify(REACT)}) continue;
      const at = e.timestamp - t0;
      const c = e.data.payload;
      if (c.on !== undefined) {
        rows.push({ at, kind: 'react', label: 'React', text: c.on ? 'commits recorded from here' : 'commits no longer recorded', more: [] });
        continue;
      }
      const named = (c.components ?? []).map((r) => r.name + (r.count > 1 ? ' ×' + r.count : '') + ' (' + r.why + ')');
      const text = (named.length > 0 ? named.slice(0, 3).join(', ') : (c.more ?? 0) + ' components') + (named.length > 3 || (c.more && named.length > 0) ? ', …' : '');
      const more = [
        [c.commits > 1 ? c.commits + ' commits' : '1 commit', c.priority, ms(c.ms)].filter(Boolean).join(' · '),
        ...(c.components ?? []).map((r) => [r.name + (r.count > 1 ? ' ×' + r.count : ''), r.at, ms(r.ms), r.selfMs === undefined ? '' : ms(r.selfMs) + ' own', r.why].filter(Boolean).join(' · ')),
        ...(c.more ? ['and ' + c.more + ' more'] : []),
      ];
      rows.push({ at, kind: 'react', label: c.ms === undefined ? 'React' : ms(c.ms), warn: c.ms > 16, slow: c.ms > 16, text, more });
    }
    for (const e of events) {
      if (e.type !== 6 || bare) continue;
      const at = e.timestamp - t0;
      if (e.data.plugin === 'rrweb/console@1') {
        const { level, payload = [], trace = [] } = e.data.payload;
        rows.push({ at, kind: 'console', label: level, bad: level === 'error' || level === 'assert', warn: level === 'warn', text: payload.map(plain).join(' '), more: trace.map((l) => 'at ' + l) });
      }
      if (e.data.plugin === 'rrweb/network@1') {
        for (const r of e.data.payload.requests ?? []) {
          // The page's own origin goes without saying.
          let name = r.name;
          try { const u = new URL(r.name); if (u.origin === origin) name = u.pathname + u.search + u.hash; } catch {}
          const more = [
            r.name,
            [r.initiatorType, Number.isFinite(r.duration) ? Math.round(r.duration) + ' ms' : '', e.data.payload.isInitial ? 'as the page loaded' : ''].filter(Boolean).join(' · '),
            ...fields('Request headers', r.requestHeaders),
            ...(r.requestBody ? ['Request body', '  ' + r.requestBody] : []),
            ...fields('Response headers', r.responseHeaders),
            ...(r.responseBody ? ['Response body', '  ' + r.responseBody] : []),
          ];
          // No status is one the browser won't say (another origin's), not one that failed.
          rows.push({ at, kind: 'network', label: r.status ? String(r.status) : '···', bad: r.status >= 400, text: (r.method ? r.method + ' ' : '') + name, more });
        }
      }
    }
    rows.sort((a, b) => a.at - b.at);
    const logged = rows.length > 0;
    const log = document.getElementById('log');
    if (rows.some((r) => r.kind === 'react')) log.querySelector('[data-hides="no-react"]').hidden = false;
    if (logged) document.body.classList.add('logged');
    // The panel's room, where the window is wide enough to show it (as the stylesheet has it).
    const side = () => (logged && innerWidth >= 900 ? 340 : 0);

    // A recording with the mic starts paused: a browser plays sound only after a click, which Play is.
    const clips = await Promise.all((kept.voice ?? []).map(async (c) => ({ ...c, audio: Object.assign(new Audio(await from.clip(c.id)), { preload: 'auto' }) })));
    const t = Number.parseFloat(params.get('t') ?? '');
    // The player's frame, at most the window's room, the controls (80px) under it; 1:1 when bare.
    const size = () => bare
      ? { width: kept.viewport.width, height: kept.viewport.height }
      : embed
      ? { width: innerWidth - side(), height: innerHeight - 80 }
      : { width: Math.min(kept.viewport.width, innerWidth - 32 - side()), height: Math.min(kept.viewport.height, innerHeight - 90 - 80 - 16) };
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
        // A recorded canvas is drawn by rrweb's own script in the replay's frame, which then must run scripts
        // (the page's own were never recorded): only for a recording that has one.
        ...(events.some((e) => e.type === 3 && e.data.source === 9) ? { UNSAFE_replayCanvas: true } : {}),
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

    // The rows: a click goes to its moment, and shows the rest of it (where a line was logged from, a request's
    // headers and bodies). All set as text: it's the recorded page's, not ours.
    const list = log.querySelector('ol');
    const bar = main.querySelector('.rr-progress');
    for (const row of rows) {
      const cell = (tag, name, text) => Object.assign(document.createElement(tag), { className: name, textContent: text });
      const go = Object.assign(document.createElement('button'), { type: 'button' });
      go.append(cell('time', '', clock(row.at)), cell('span', 'label', row.label), cell('span', 'text', row.text));
      const more = Object.assign(cell('pre', '', row.more.join('\\n')), { hidden: true });
      row.el = Object.assign(document.createElement('li'), { className: row.kind + (row.bad ? ' bad' : row.warn ? ' warn' : '') });
      go.addEventListener('click', () => {
        player.goto(Math.min(row.at, total), playing);
        more.hidden = !more.hidden || row.more.length === 0;
        row.el.classList.toggle('open', !more.hidden);
      });
      row.el.append(go, more);
      list.append(row.el);
      // An error, or a request that failed, is a mark on the timeline too.
      if (row.slow && bar) bar.append(Object.assign(cell('i', 'slow-mark', ''), { title: row.label + ': ' + row.text.slice(0, 200), style: 'left:' + (total > 0 ? (row.at / total) * 100 : 0) + '%' }));
      if (row.bad && bar) bar.append(Object.assign(cell('i', 'bad-mark', ''), { title: row.text.slice(0, 200), style: 'left:' + (total > 0 ? (row.at / total) * 100 : 0) + '%' }));
    }
    for (const button of log.querySelectorAll('.filters button')) {
      button.addEventListener('click', () => {
        const on = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(on));
        if (button.dataset.hides) log.classList.toggle(button.dataset.hides, !on);
        if (button.dataset.shows) log.classList.toggle(button.dataset.shows, on);
      });
    }
    // The row the replay is at: the last whose moment has come, lit, the ones to come faint, kept in sight unless
    // the list is being read.
    let lit;
    const light = (now) => {
      let i = -1;
      while (i + 1 < rows.length && rows[i + 1].at <= now) i++;
      if (i === lit) return;
      lit = i;
      rows.forEach((row, k) => { row.el.classList.toggle('ahead', k > i); row.el.classList.toggle('now', k === i); });
      if (i >= 0 && !log.matches(':hover')) rows[i].el.scrollIntoView({ block: 'nearest' });
    };
    const follow = () => {
      const win = replayer.iframe.contentWindow;
      if (win) marks.style.transform = 'translate(' + -win.scrollX + 'px,' + -win.scrollY + 'px)';
      const now = Math.min(replayer.getCurrentTime(), total);
      light(now);
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
