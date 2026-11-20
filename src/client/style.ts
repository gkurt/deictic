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
.box {
  position: fixed;
  display: none;
  z-index: 2147483646;
  pointer-events: none;
  box-sizing: border-box;
  outline: 2px solid var(--deictic-accent);
  background: rgb(18 179 88 / 0.1);
}
.box.shown { display: block; }
.box.inner { outline: 1px dashed var(--deictic-accent); background: none; }
.label {
  position: absolute;
  left: -2px;
  bottom: 100%;
  padding: 1px 6px;
  font: 12px/1.5 ui-monospace, monospace;
  white-space: nowrap;
  color: var(--deictic-on-accent);
  background: var(--deictic-accent);
}
.label.below { top: 100%; bottom: auto; }
.panel {
  position: fixed;
  z-index: 2147483647;
  width: min(360px, calc(100vw - 16px));
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border: 1px solid var(--deictic-line);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
  font: 13px/1.4 system-ui, sans-serif;
  color: var(--deictic-fg);
  background: var(--deictic-bg);
}
.panel.pinned { position: relative; z-index: auto; max-height: none; }
.head {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 4px 8px 0;
}
.head .tab {
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  padding: 4px 8px;
  font-weight: 600;
  color: var(--deictic-muted);
}
.head .tab:hover { color: var(--deictic-fg); }
.head .tab[aria-selected='true'] { color: var(--deictic-fg); border-bottom-color: var(--deictic-accent); }
.head .close { margin: 0 0 4px auto; }
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-top: 1px solid var(--deictic-line);
  border-bottom: 1px solid var(--deictic-line);
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
.bar .where svg { flex: none; }
.bar .where:hover, .bar .where:focus-visible { color: var(--deictic-fg); }
.bar .where:hover span { text-decoration: underline; }
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
  font-size: 22px;
  line-height: 1;
  background: var(--deictic-bg);
}
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
button.primary { background: var(--deictic-accent); border-color: var(--deictic-accent); color: var(--deictic-on-accent); }
input, textarea {
  box-sizing: border-box;
  width: 100%;
  font: 12px ui-monospace, monospace;
  color: inherit;
  background: #09090b;
  border: 1px solid var(--deictic-line);
  border-radius: 4px;
  padding: 4px 6px;
}
input:focus, textarea:focus { outline: 1px solid var(--deictic-accent); }
code { font: 12px ui-monospace, monospace; }
.body { padding: 8px; overflow: auto; }
.status { padding: 0 8px 6px; font-size: 12px; color: var(--deictic-muted); }
.status:empty { display: none; }
.status.problem { color: var(--deictic-problem); }
`;
