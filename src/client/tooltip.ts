/**
 * One tooltip for everything deictic draws in a shadow root: whatever has a `title` (or `data-tip`) shows it
 * in a box of ours, soon after the pointer rests or focus lands, instead of the browser's, which comes late
 * and looks like nothing else here. Plugins only set `title`, as they would anywhere; the first hover moves
 * it to `data-tip`, so the browser's own stays away, and gives a textless control the title as its name.
 * The box is fixed in the root, so no panel's scrolling clips it.
 */
const DELAY = 300;

export function tooltips(root: ShadowRoot): void {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  root.append(tip);
  let timer = 0;
  let over: Element | undefined;

  const hide = () => {
    clearTimeout(timer);
    over = undefined;
    tip.classList.remove('shown');
  };
  const show = (el: Element) => {
    const text = el.getAttribute('data-tip');
    if (text === null || text === '' || !el.isConnected) return hide();
    tip.textContent = text;
    // Last in the root, over a modal or toolbar added since at the same z-index.
    if (tip !== root.lastElementChild) root.append(tip);
    tip.classList.add('shown');
    // Centred below it, kept on screen; above it where there's no room below.
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left + r.width / 2 - t.width / 2, innerWidth - t.width - 8));
    const top = r.bottom + 6 + t.height > innerHeight - 8 ? r.top - 6 - t.height : r.bottom + 6;
    Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
  };
  /** The element with a tip around where the event happened, its `title` taken over the first time. */
  const tipped = (e: Event) => {
    for (const node of e.composedPath()) {
      if (!(node instanceof Element)) continue;
      if (node === tip) return undefined;
      // A frame's title is its name for assistive tech, not a tip; what's in it has tips of its own.
      if (node.localName === 'iframe') return undefined;
      const title = node.getAttribute('title');
      if (title !== null) {
        node.removeAttribute('title');
        if (title === '') continue;
        node.setAttribute('data-tip', title);
        // A control with no text of its own (an icon, ×, ↶) is known by its tip; one with text keeps its name.
        if (!node.hasAttribute('aria-label') && (node.textContent ?? '').trim().length <= 1) node.setAttribute('aria-label', title);
        else node.setAttribute('aria-description', title);
      }
      if (node.hasAttribute('data-tip')) return node;
    }
    return undefined;
  };
  const enter = (e: Event) => {
    const el = tipped(e);
    if (el === over) return;
    hide();
    if (el === undefined) return;
    over = el;
    timer = window.setTimeout(() => show(el), e.type === 'focusin' ? 0 : DELAY);
  };
  root.addEventListener('pointerover', enter);
  root.addEventListener('focusin', (e) => {
    // Focus from the keyboard only: a click focuses too, and its tip is the pointer's.
    if ((e.target as Element).matches(':focus-visible')) enter(e);
  });
  root.addEventListener('pointerout', (e) => {
    const to = (e as PointerEvent).relatedTarget;
    if (over !== undefined && !(to instanceof Node && over.contains(to))) hide();
  });
  root.addEventListener('focusout', hide);
  // A press acts, and what it changes (a mic turned on) may change the tip: the next hover shows the new one.
  root.addEventListener('pointerdown', hide);
  addEventListener('scroll', hide, { capture: true, passive: true });
}
