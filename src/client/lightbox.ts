/**
 * The lightbox: what a panel has attached (a capture, a recording's replay, a voice clip), big, over everything,
 * one at a time, ← and → between them. It grows out of the element that opened it and shrinks back into it, or
 * fades where motion is reduced. A sound plays in a player of its own: play, its waveform with what's played
 * lit (click or drag it to seek), and the time. It's a modal (`data-deictic-modal`): Esc closes it, not the popup.
 */
import type { LightboxItem, LightboxOptions } from '#src/index.ts';

import { type Colors, drawBars, peaksOf } from './waveform.ts';

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" fill="currentColor"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Opens it in `root`. `pinned` draws it where `root` is in the page instead, with no backdrop, motion or keys, and
 * actions that don't close it: for a page of deictic's own states (`lightboxIn`).
 */
export function openLightbox(
  root: ShadowRoot,
  items: LightboxItem[],
  { at = 0, from, pinned = false }: LightboxOptions & { pinned?: boolean } = {},
): { close: () => void } {
  const box = div(pinned ? 'lightbox pinned' : 'lightbox');
  if (!pinned) {
    box.dataset.deicticModal = '';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
  }
  const backdrop = div('lb-backdrop');
  const stage = div('lb-stage');
  const head = div('lb-head');
  const title = div('lb-title');
  const count = div('lb-count');
  const actions = div('lb-actions');
  const close = button('×', 'Close (Esc)', 'lb-close');
  head.append(title, count, actions, close);
  const body = div('lb-body');
  stage.append(head, body);
  const prev = button('‹', 'Previous (←)', 'lb-prev');
  const next = button('›', 'Next (→)', 'lb-next');
  box.append(backdrop, stage, ...(items.length > 1 ? [prev, next] : []));
  root.append(box);

  let index = Math.min(Math.max(0, at), items.length - 1);
  let leave: (() => void) | undefined;
  let closing = false;

  const show = (i: number, animate: boolean) => {
    leave?.();
    leave = undefined;
    index = (i + items.length) % items.length;
    const item = items[index]!;
    box.setAttribute('aria-label', item.title);
    title.textContent = item.title;
    count.textContent = items.length > 1 ? `${index + 1} / ${items.length}` : '';
    actions.replaceChildren(
      ...(item.actions ?? []).map((a) => {
        const b = button(a.label, a.title ?? '', '');
        b.addEventListener('click', () => {
          if (!pinned) done();
          a.run();
        });
        return b;
      }),
    );
    // A sound plays as it opens, but not on a page that only shows the lightbox.
    const content = contentOf(item, !pinned);
    body.replaceChildren(content.element);
    leave = content.leave;
    if (animate && !reduced()) body.animate({ opacity: [0, 1] }, { duration: 160, easing: 'ease-out' });
  };

  /** The transform that puts the stage where `from` is: what it grows from and shrinks back to. */
  const fromRect = () => {
    if (from === undefined || !from.isConnected) return undefined;
    const f = from.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    if (f.width === 0 || s.width === 0) return undefined;
    return `translate(${f.left - s.left}px, ${f.top - s.top}px) scale(${f.width / s.width}, ${f.height / s.height})`;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') done();
    else if (e.key === 'ArrowLeft' && items.length > 1) show(index - 1, true);
    else if (e.key === 'ArrowRight' && items.length > 1) show(index + 1, true);
    else return;
    // The popup, under it, waits for its own Esc.
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  if (!pinned) addEventListener('keydown', onKey, true);

  function done() {
    if (closing) return;
    closing = true;
    removeEventListener('keydown', onKey, true);
    leave?.();
    if (pinned) return box.remove();
    const gone = () => {
      box.remove();
      if (from instanceof HTMLElement && from.isConnected) from.focus({ preventScroll: true });
    };
    if (reduced()) return gone();
    const to = fromRect();
    backdrop.animate({ opacity: [1, 0] }, { duration: 200, easing: 'ease-in', fill: 'forwards' });
    stage
      .animate(
        to === undefined
          ? { opacity: [1, 0], transform: ['none', 'scale(0.96)'] }
          : { transform: ['none', to], opacity: [1, 1, 0], offset: [0, 0.8, 1] },
        { duration: 220, easing: EASE, fill: 'forwards' },
      )
      .finished.then(gone, gone);
  }

  backdrop.addEventListener('click', done);
  close.addEventListener('click', done);
  prev.addEventListener('click', () => show(index - 1, true));
  next.addEventListener('click', () => show(index + 1, true));

  show(index, false);
  if (pinned) {
    close.hidden = true;
    return { close: done };
  }
  close.focus({ preventScroll: true });
  if (reduced()) {
    box.animate({ opacity: [0, 1] }, { duration: 150 });
  } else {
    backdrop.animate({ opacity: [0, 1] }, { duration: 240, easing: 'ease-out' });
    const grow = fromRect();
    stage.animate(
      grow === undefined
        ? { opacity: [0, 1], transform: ['scale(0.96)', 'none'] }
        : { transform: [grow, 'none'], opacity: [0, 1, 1], offset: [0, 0.2, 1] },
      { duration: 280, easing: EASE },
    );
  }
  return { close: done };
}

/** An item, drawn: what goes in the body, and what to stop when it's left (a sound playing). */
function contentOf(item: LightboxItem, autoplay: boolean): { element: HTMLElement; leave?: () => void } {
  switch (item.kind) {
    case 'image': {
      const img = Object.assign(document.createElement('img'), { src: item.url, alt: item.title, className: 'lb-image', draggable: false });
      return { element: img };
    }
    case 'page': {
      const frame = Object.assign(document.createElement('iframe'), { src: item.url, title: item.title, className: 'lb-page' });
      frame.allow = 'autoplay; fullscreen';
      return { element: frame };
    }
    case 'audio':
      return player(item.url, autoplay);
  }
}

/** A sound: play and pause, its waveform with what's played lit, and the time. With `autoplay`, it starts playing. */
function player(url: string, autoplay: boolean): { element: HTMLElement; leave: () => void } {
  const el = div('lb-audio');
  const play = button('', 'Play (Space)', 'lb-play');
  const wave = Object.assign(document.createElement('canvas'), { className: 'lb-wave' });
  wave.setAttribute('role', 'slider');
  wave.setAttribute('aria-label', 'Where in the clip');
  wave.tabIndex = 0;
  const time = div('lb-time');
  el.append(play, wave, time);
  const audio = new Audio(url);
  const colors: Colors = { played: '#a78bfa', rest: '#52525b' };
  // Flat until the clip's read: the bars rise when its peaks are in.
  let peaks: number[] = Array<number>(120).fill(0.05);
  let frame = 0;
  // MediaRecorder's webm says no length until it's played through; reading the peaks gives it sooner.
  let length = 0;
  const lengthOf = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : length);
  const draw = () => {
    const total = lengthOf();
    drawBars(wave, peaks, total > 0 ? audio.currentTime / total : 0, colors);
    time.textContent = `${clock(audio.currentTime)} / ${total > 0 ? clock(total) : '–:––'}`;
    wave.setAttribute('aria-valuenow', String(Math.round(audio.currentTime)));
  };
  const loop = () => {
    draw();
    frame = audio.paused ? 0 : requestAnimationFrame(loop);
  };
  const state = () => {
    play.innerHTML = audio.paused ? PLAY : PAUSE;
    play.title = audio.paused ? 'Play (Space)' : 'Pause (Space)';
    if (!audio.paused && frame === 0) frame = requestAnimationFrame(loop);
    draw();
  };
  audio.addEventListener('play', state);
  audio.addEventListener('pause', state);
  audio.addEventListener('ended', state);
  audio.addEventListener('loadedmetadata', draw);
  const toggle = () => void (audio.paused ? audio.play().catch(() => {}) : audio.pause());
  play.addEventListener('click', toggle);
  const seek = (e: PointerEvent) => {
    const r = wave.getBoundingClientRect();
    const total = lengthOf();
    if (total > 0) audio.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * total;
    draw();
  };
  wave.addEventListener('pointerdown', (e) => {
    wave.setPointerCapture(e.pointerId);
    seek(e);
  });
  wave.addEventListener('pointermove', (e) => {
    if (wave.hasPointerCapture(e.pointerId)) seek(e);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== ' ') return;
    e.preventDefault();
    toggle();
  });
  void peaksOf(url, 120).then(
    (read) => {
      peaks = read.peaks;
      length = read.duration;
      draw();
    },
    // Undecodable here: the player still plays it, over flat bars.
    () => {},
  );
  state();
  if (autoplay) void audio.play().catch(() => state());
  // The canvas has its size once it's in the page.
  requestAnimationFrame(draw);
  return {
    element: el,
    leave: () => {
      audio.pause();
      cancelAnimationFrame(frame);
    },
  };
}

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function button(text: string, title: string, className: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = text;
  el.title = title;
  el.className = className;
  return el;
}
