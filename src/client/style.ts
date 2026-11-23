/**
 * The overlay's styles, in its shadow root. Panels style their bodies with the same custom
 * properties, so a plugin's panel looks like the rest without styles of its own for the basics.
 */
export const STYLE = `
:host {
  --deictic-accent: #12b358;
  --deictic-on-accent: #04130b;
  --deictic-bg: #18181b;
  --deictic-fg: #f4f4f5;
  --deictic-muted: #a1a1aa;
  --deictic-line: #3f3f46;
  --deictic-problem: #f87171;
  all: initial;
  /* Inherited by everything in the root: a thumb and no track, on whatever the panel's background is. */
  scrollbar-color: var(--deictic-line) transparent;
}
/* The host takes no room in the page: everything in it is fixed, so nothing of deictic's moves or scrolls it. */
:host(deictic-overlay) { display: contents; }
/* What's under the pointer inside the lit element, where that differs. */
.inner {
  position: fixed;
  display: none;
  z-index: 2147483646;
  pointer-events: none;
  box-sizing: border-box;
  outline: 1px dashed var(--deictic-accent);
}
.inner.shown { display: block; }
/* Glass, over a page that's dimmed around what it's about. */
.panel {
  --deictic-line: rgb(255 255 255 / 0.14);
  position: fixed;
  z-index: 2147483647;
  width: min(440px, calc(100vw - 16px));
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border: 1px solid rgb(255 255 255 / 0.1);
  border-radius: 14px;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4), 0 24px 64px -12px rgb(0 0 0 / 0.55), 0 0 56px -12px rgb(18 179 88 / 0.35),
    inset 0 1px 0 rgb(255 255 255 / 0.08);
  font: 13px/1.4 system-ui, sans-serif;
  color: var(--deictic-fg);
  background: linear-gradient(rgb(39 39 42 / 0.9), rgb(24 24 27 / 0.94));
  backdrop-filter: blur(24px) saturate(1.8);
}
.panel.pinned { position: relative; z-index: auto; width: min(440px, 100%); max-height: none; }
@keyframes deictic-in {
  from { opacity: 0; translate: 0 4px; }
}
.head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 8px 6px;
}
/* Over the page the head is what the popup is dragged by; no touch scrolling starts there. */
.panel:not(.pinned) .head { cursor: grab; touch-action: none; user-select: none; }
.panel.dragging .head, .panel.dragging .head button { cursor: grabbing; }
.head .tab {
  position: relative;
  border: 0;
  border-radius: 8px;
  padding: 4px 10px;
  font-weight: 600;
  color: var(--deictic-muted);
}
.head .tab:hover { color: var(--deictic-fg); }
.head .tab[aria-selected='true'] { color: var(--deictic-fg); }
/* A pill behind the shown tab, slid to the next one shown. */
.head .thumb {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 6px;
  border-radius: 8px;
  background: rgb(255 255 255 / 0.1);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
  pointer-events: none;
}
.head .end { margin-left: auto; }
.bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 10px 8px 12px;
  border-bottom: 1px solid rgb(255 255 255 / 0.08);
}
.bar .where {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  margin-right: auto;
  font: 12px ui-monospace, monospace;
  color: var(--deictic-muted);
  text-decoration: none;
}
.bar .where span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar .where .tag { flex: none; color: var(--deictic-accent); }
.bar .where svg { flex: none; }
.bar .where:hover, .bar .where:focus-visible { color: var(--deictic-fg); }
.bar .where:hover span { text-decoration: underline; }
.bar .absent { flex: none; margin-right: 6px; font-size: 12px; color: var(--deictic-muted); }
/* The page dims around the element (lighting.ts), by a shadow far wider than any window. */
.veil {
  position: fixed;
  z-index: 2147483644;
  box-sizing: border-box;
  pointer-events: none;
  box-shadow: 0 0 0 200vmax rgb(9 9 11 / 0.5);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s, visibility 0s 0.2s;
}
/* A moment late: Alt is pressed for much else, and a page that dimmed with every press would flicker. */
.veil.shown { opacity: 1; visibility: visible; transition: opacity 0.3s 0.08s; }
.veil.shown.lifted { opacity: 0; transition: opacity 0.6s; }
.aim {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.12s, visibility 0s 0.12s;
}
.aim.shown { opacity: 1; visibility: visible; transition: opacity 0.12s; }
.ring {
  position: absolute;
  box-sizing: border-box;
  border: 1.5px solid var(--deictic-accent);
  box-shadow: 0 0 0 4px rgb(18 179 88 / 0.14), 0 0 32px rgb(18 179 88 / 0.5), inset 0 0 24px rgb(18 179 88 / 0.1);
}
/* From the element's edges across the window: what it lines up with, anywhere on the page. */
.guide { position: absolute; left: 0; top: 0; opacity: 0.35; }
.guide.gx { width: 1px; height: 100%; background: linear-gradient(transparent, var(--deictic-accent) 20% 80%, transparent); }
.guide.gy { width: 100%; height: 1px; background: linear-gradient(90deg, transparent, var(--deictic-accent) 20% 80%, transparent); }
.caption {
  position: absolute;
  left: -1.5px;
  bottom: calc(100% + 8px);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px 3px 3px;
  border: 1px solid rgb(255 255 255 / 0.12);
  border-radius: 999px;
  font: 12px/20px ui-monospace, monospace;
  white-space: nowrap;
  color: var(--deictic-fg);
  background: rgb(24 24 27 / 0.86);
  backdrop-filter: blur(12px) saturate(1.6);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}
.caption.below { top: calc(100% + 8px); bottom: auto; }
.caption .tag { padding: 0 8px; border-radius: 999px; font-weight: 600; color: var(--deictic-on-accent); background: var(--deictic-accent); }
.caption .dim { color: var(--deictic-muted); }
.caption .opens { padding-left: 8px; border-left: 1px solid rgb(255 255 255 / 0.16); font: 600 12px/20px system-ui, sans-serif; color: var(--deictic-accent); }
.lit { position: fixed; inset: 0; z-index: 2147483646; display: none; pointer-events: none; }
.lit.shown { display: block; }
.lit svg { display: block; width: 100%; height: 100%; fill: none; stroke: var(--deictic-accent); stroke-linecap: round; }
.lit .halo { stroke-width: 7; opacity: 0.16; }
.lit .lock, .lit .tether { stroke-width: 1.5; }
.lit .flow { stroke: #eafff3; stroke-width: 2; opacity: 0; }
.lit circle { fill: var(--deictic-accent); stroke: none; }
.lit:not(.tied) path, .lit:not(.tied) circle { display: none; }
.pulse {
  position: fixed;
  z-index: 2147483646;
  box-sizing: border-box;
  pointer-events: none;
  outline: 2px solid var(--deictic-accent);
  animation: deictic-pulse 0.5s ease-out forwards;
}
@media (prefers-reduced-motion: no-preference) {
  .head .thumb.moves { transition: left 0.22s cubic-bezier(0.3, 0.7, 0.2, 1), width 0.22s cubic-bezier(0.3, 0.7, 0.2, 1); }
  /* The light goes from one element to the next, not out and on again. */
  .veil.shown.glide {
    transition: opacity 0.3s, left 0.24s cubic-bezier(0.3, 0.7, 0.2, 1), top 0.24s cubic-bezier(0.3, 0.7, 0.2, 1),
      width 0.24s cubic-bezier(0.3, 0.7, 0.2, 1), height 0.24s cubic-bezier(0.3, 0.7, 0.2, 1), border-radius 0.24s;
  }
  .aim.glide .ring {
    transition: left 0.24s cubic-bezier(0.3, 0.7, 0.2, 1), top 0.24s cubic-bezier(0.3, 0.7, 0.2, 1),
      width 0.24s cubic-bezier(0.3, 0.7, 0.2, 1), height 0.24s cubic-bezier(0.3, 0.7, 0.2, 1), border-radius 0.24s;
  }
  .aim.glide .guide { transition: translate 0.24s cubic-bezier(0.3, 0.7, 0.2, 1); }
  .panel:not(.pinned) { animation: deictic-rise 0.32s cubic-bezier(0.2, 0.9, 0.25, 1.1) backwards; }
  /* Once, as the popup opens: the line drawn out to the popup, with a light along it. */
  .lit .tether, .lit path.halo { stroke-dasharray: 1; animation: deictic-draw 0.4s 0.1s ease-out backwards; }
  .lit .flow { stroke-dasharray: 0.14 1; animation: deictic-flow 0.8s 0.45s ease-out; }
  .lit circle:last-of-type { animation: deictic-in 0.2s 0.45s backwards; }
}
@keyframes deictic-rise {
  from { opacity: 0; scale: 0.94; filter: blur(6px); }
}
@keyframes deictic-draw {
  from { stroke-dashoffset: 1; }
}
@keyframes deictic-flow {
  from { stroke-dashoffset: 0.14; opacity: 1; }
  to { stroke-dashoffset: -1; opacity: 0; }
}
@keyframes deictic-pulse {
  to { outline-offset: 14px; outline-color: transparent; }
}
/* The tool panel (tools.ts): the plugins' tools in a bar on an edge of the window, there while it's of use. */
.tool-panel {
  position: fixed;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid rgb(255 255 255 / 0.1);
  border-radius: 12px;
  font: 13px/1.4 system-ui, sans-serif;
  color: var(--deictic-fg);
  background: linear-gradient(rgb(39 39 42 / 0.92), rgb(24 24 27 / 0.96));
  backdrop-filter: blur(24px) saturate(1.8);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4), 0 16px 40px -8px rgb(0 0 0 / 0.55), inset 0 1px 0 rgb(255 255 255 / 0.08);
  user-select: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s, visibility 0s 0.15s;
}
.tool-panel.shown { opacity: 1; visibility: visible; transition: opacity 0.15s; }
.tool-panel.vertical, .tool-panel.vertical .tool-group { flex-direction: column; }
.tool-panel .tool-group { display: flex; align-items: center; gap: 4px; }
/* Groups of one section side by side, as close as the tools in a group are: the bar's gap is for between sections. */
.tool-panel .tool-group + .tool-group { margin-left: -2px; }
.tool-panel.vertical .tool-group + .tool-group { margin: -2px 0 0; }
.tool-panel .grip { display: inline-flex; padding: 2px; color: var(--deictic-muted); cursor: grab; touch-action: none; }
.tool-panel .grip:active { cursor: grabbing; }
.tool-panel .grip svg { width: 16px; height: 16px; }
.tool-panel .sep { align-self: stretch; width: 1px; background: rgb(255 255 255 / 0.12); }
.tool-panel.vertical .sep { width: auto; height: 1px; }
/* A group with nothing to show now (a plugin's, hidden) has no line of its own either. */
.tool-panel .sep:has(+ [hidden]) { display: none; }
.tool-panel [hidden] { display: none; }
.tool-panel button.icon { width: 28px; height: 26px; border-radius: 6px; color: var(--deictic-fg); }
.tool-panel button.icon svg { width: 16px; height: 16px; }
.tool-panel button[aria-pressed='true'], .tool-panel button[aria-pressed='true']:hover {
  color: var(--deictic-on-accent);
  background: var(--deictic-accent);
}
.tool-panel button.problem { color: var(--deictic-problem); }
/*
 * The drawer (drawer.ts): on the window's side, as tall as what's in it, there while it's of use. Its
 * sections are the plugins', each with its own styles; these are what they share.
 */
.drawer {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 296px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  border: 1px solid rgb(255 255 255 / 0.1);
  border-radius: 12px;
  font: 12px/1.4 system-ui, sans-serif;
  color: var(--deictic-fg);
  background: linear-gradient(rgb(39 39 42 / 0.92), rgb(24 24 27 / 0.96));
  backdrop-filter: blur(24px) saturate(1.8);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4), 0 16px 40px -8px rgb(0 0 0 / 0.55), inset 0 1px 0 rgb(255 255 255 / 0.08);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s, visibility 0s 0.15s;
}
.drawer.left { right: auto; left: 12px; }
.drawer.shown { opacity: 1; visibility: visible; transition: opacity 0.15s; }
.drawer [hidden] { display: none; }
.drawer-sections, .drawer-view { display: flex; flex-direction: column; gap: 12px; min-height: 0; padding: 10px; overflow-y: auto; scrollbar-width: thin; }
.drawer-view { gap: 8px; }
.drawer-section h3 { display: flex; align-items: center; gap: 6px; margin: 0 0 4px; font: 600 10px/1.4 system-ui, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: var(--deictic-muted); }
.drawer-rows { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
.drawer-row { display: flex; align-items: center; gap: 2px; padding-right: 4px; border: 1px solid rgb(255 255 255 / 0.08); border-radius: 8px; background: rgb(255 255 255 / 0.04); }
.drawer-row:hover { border-color: rgb(255 255 255 / 0.16); }
/* A row one height whether it has a picture, and the picture one size, loaded or not: nothing moves as one comes. */
.drawer-open { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; height: 32px; padding: 0 6px; border: 0; text-align: left; font-size: 12px; }
.drawer-open img { flex: none; display: block; width: 36px; height: 24px; object-fit: cover; border-radius: 4px; background: rgb(255 255 255 / 0.08); }
.drawer-open svg { flex: none; width: 12px; height: 12px; }
.drawer-head { display: flex; align-items: center; gap: 6px; margin: -4px 24px 0 -4px; }
/* Folding it away: the button in its corner, and the pill it folds to, which counts what's in it. */
.drawer-fold { position: absolute; top: 6px; right: 6px; z-index: 1; width: 22px; height: 22px; border-radius: 6px; color: var(--deictic-muted); }
.drawer-fold svg { width: 14px; height: 14px; }
.drawer-sections > .drawer-section:first-child h3 { margin-right: 22px; }
.drawer-pill { display: none; align-items: center; gap: 6px; padding: 6px 10px; border: 0; border-radius: inherit; font: 600 12px/1 system-ui, sans-serif; color: var(--deictic-fg); }
.drawer-pill svg { width: 16px; height: 16px; }
.drawer-pill.news span { padding: 2px 6px; border-radius: 8px; color: var(--deictic-on-accent); background: var(--deictic-accent); }
.drawer.folded { width: auto; }
.drawer.folded > :not(.drawer-pill) { display: none; }
.drawer.folded .drawer-pill { display: inline-flex; }
.drawer-title { font-weight: 600; }
/* What a tool that picks a point takes the pointer with, over the page and under the popup. */
.tool-surface { position: fixed; inset: 0; z-index: 2147483645; cursor: crosshair; }
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  font: 13px/1.4 system-ui, sans-serif;
  color: var(--deictic-fg);
}
.lb-backdrop { position: absolute; inset: 0; background: rgb(9 9 11 / 0.72); backdrop-filter: blur(2px); }
.lb-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  max-width: 92vw;
  max-height: 90vh;
  border: 1px solid var(--deictic-line);
  border-radius: 10px;
  background: var(--deictic-bg);
  box-shadow: 0 24px 64px rgb(0 0 0 / 0.5);
  transform-origin: 0 0;
  overflow: hidden;
}
.lb-head { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 12px; border-bottom: 1px solid var(--deictic-line); }
.lb-title { font-weight: 600; }
.lb-count { color: var(--deictic-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.lb-actions { display: flex; gap: 6px; margin-left: auto; }
.lb-body { display: flex; justify-content: center; min-height: 0; background: #09090b; }
.lb-image { display: block; max-width: 92vw; max-height: calc(90vh - 48px); object-fit: contain; }
.lb-page { display: block; width: min(1280px, 92vw); height: min(860px, calc(90vh - 48px)); border: 0; background: #18181b; }
.lb-audio { display: flex; align-items: center; gap: 12px; width: min(640px, 86vw); padding: 20px 16px; }
.lb-play {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: var(--deictic-on-accent);
  background: var(--deictic-accent);
}
.lb-play svg { width: 16px; height: 16px; }
.lb-wave { flex: 1; min-width: 0; height: 56px; cursor: pointer; border-radius: 4px; }
.lb-wave:focus-visible { outline: 1px solid var(--deictic-accent); outline-offset: 2px; }
.lb-time { flex: none; min-width: 9ch; text-align: right; font: 12px ui-monospace, monospace; color: var(--deictic-muted); }
.lb-prev, .lb-next {
  position: absolute;
  top: 50%;
  translate: 0 -50%;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--deictic-line);
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--deictic-bg);
}
.lb-prev svg, .lb-next svg { width: 20px; height: 20px; }
.lb-prev { left: 16px; }
.lb-next { right: 16px; }
.lightbox.pinned { position: relative; inset: auto; z-index: auto; display: block; padding: 0 64px; }
.lightbox.pinned .lb-stage { max-width: 100%; max-height: none; }
.lightbox.pinned .lb-page { width: 100%; height: 420px; }
.lightbox.pinned .lb-image { max-width: 100%; max-height: 420px; }
.lightbox.pinned .lb-backdrop { display: none; }
.lightbox.pinned .lb-audio { width: 100%; box-sizing: border-box; }
.lightbox.pinned .lb-close { display: none; }
.tip {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 2147483647;
  max-width: 280px;
  padding: 3px 6px;
  border: 1px solid var(--deictic-line);
  border-radius: 4px;
  font: 12px/1.4 system-ui, sans-serif;
  color: var(--deictic-fg);
  background: #09090b;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.3);
  pointer-events: none;
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.12s;
}
.tip.shown { visibility: visible; opacity: 1; }
/* A control's keys, after its name: caps, as on a keyboard. */
.tip kbd {
  display: inline-block;
  box-sizing: border-box;
  min-width: 18px;
  margin-left: 3px;
  padding: 0 4px;
  border: 1px solid var(--deictic-line);
  border-bottom-width: 2px;
  border-radius: 4px;
  font: 11px/15px ui-monospace, monospace;
  text-align: center;
  color: var(--deictic-fg);
  background: rgb(255 255 255 / 0.08);
}
.tip kbd:first-of-type { margin-left: 6px; }
.tip kbd:first-child { margin-left: 0; }
button {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--deictic-line);
  border-radius: 4px;
  padding: 1px 7px;
  cursor: pointer;
}
button:hover { border-color: var(--deictic-muted); }
button:disabled { opacity: 0.5; cursor: default; }
button:disabled:hover { border-color: var(--deictic-line); }
/* One ring for whatever the keyboard lands on, in place of each browser's own. */
button:focus-visible, a:focus-visible { outline: 1px solid var(--deictic-accent); outline-offset: 1px; }
button.icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  color: var(--deictic-muted);
}
button.icon svg { width: 14px; height: 14px; }
button.icon:hover:not(:disabled) { color: var(--deictic-fg); background: rgb(255 255 255 / 0.08); }
button.primary {
  background: var(--deictic-accent);
  border-color: var(--deictic-accent);
  color: var(--deictic-on-accent);
  box-shadow: 0 4px 16px -4px rgb(18 179 88 / 0.6);
}
input, textarea {
  box-sizing: border-box;
  width: 100%;
  font: 12px ui-monospace, monospace;
  color: inherit;
  background: rgb(0 0 0 / 0.35);
  border: 1px solid var(--deictic-line);
  border-radius: 6px;
  padding: 4px 6px;
}
input:focus, textarea:focus { outline: 1px solid var(--deictic-accent); }
code { font: 12px ui-monospace, monospace; }
/* Border-box, as the popup holds the body's height by its whole box while a tab reads. */
.body { box-sizing: border-box; padding: 12px; overflow: auto; }
.status { padding: 0 12px 10px; font-size: 12px; color: var(--deictic-muted); }
.status:empty { display: none; }
.status.problem { color: var(--deictic-problem); }
`;
