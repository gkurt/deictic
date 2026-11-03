import { lightboxIn, popupIn } from 'deictic/client';
import { useEffect, useRef } from 'react';

import { Kbd, Shell } from '#src/shell.tsx';

/**
 * deictic's own UI, open where it can be pointed at: each tab of the popup, pinned beside the element it's
 * open on. Alt-click anything in one and leave a task: it names what you pointed at inside it, for an agent
 * working the board to fix. Not linked from the site, and not in its build.
 */
export function Internal() {
  return (
    <Shell>
      <section className="py-10">
        <p className="text-sm font-medium text-violet-600 dark:text-violet-400">Internal</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">The popup, pinned</h1>
        <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-400">
          Each tab of deictic's popup, open on the button beside it and working as it does over a page. Hold <Kbd>Alt</Kbd> and point inside
          one: the dashed outline is what you're pointing at, and a task you leave says where it is in the popup. Closing one opens it
          again.
        </p>
      </section>
      <div className="grid gap-12 pb-16">
        <Pinned tab="tasks" title="Task" />
        <Pinned tab="tailwind" title="Tailwind" />
        <PinnedLightbox />
      </div>
    </Shell>
  );
}

/**
 * The lightbox a task's chips open, pinned, with one of each thing it shows: a capture (drawn here), a
 * recording's replay (the playground stands in), and a voice clip (a few made-up syllables).
 */
function PinnedLightbox() {
  const host = useRef<HTMLDivElement>(null);
  // lightboxIn draws outside React, into the host once it's mounted, and takes itself down on unmount.
  useEffect(() => {
    if (host.current === null) return;
    const voice = URL.createObjectURL(syllables());
    const remove = lightboxIn(host.current, [
      { kind: 'image', url: capture(), title: 'Screenshot 1', actions: [{ label: 'Change marks', run: () => {} }] },
      { kind: 'page', url: '/example/', title: 'Recording · 0:12', actions: [{ label: 'New tab', run: () => {} }] },
      { kind: 'audio', url: voice, title: 'Voice · 0:03' },
    ]);
    return () => {
      remove();
      URL.revokeObjectURL(voice);
    };
  }, []);
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">Lightbox</h2>
      <p className="mb-4 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        What a task's chips open, over the page, growing out of the chip. Here it stays put: its arrows step through a capture, a recording
        and a voice clip.
      </p>
      <div ref={host} data-pinned="lightbox" />
    </section>
  );
}

/** A made-up capture: a page with a heading, a card and a red ring drawn round it. */
function capture(): string {
  const canvas = Object.assign(document.createElement('canvas'), { width: 960, height: 540 });
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 960, 540);
  g.fillStyle = '#18181b';
  g.font = 'bold 44px system-ui';
  g.fillText('Point at it. Change what made it.', 64, 120);
  g.fillStyle = '#f4f4f5';
  g.fillRect(64, 200, 380, 200);
  g.fillStyle = '#7c3aed';
  g.fillRect(96, 330, 160, 40);
  g.strokeStyle = '#ef4444';
  g.lineWidth = 4;
  g.beginPath();
  g.ellipse(254, 300, 230, 140, -0.05, 0, Math.PI * 2);
  g.stroke();
  return canvas.toDataURL('image/png');
}

/** Three seconds of syllable-like tones with gaps, as a WAV: something for the waveform to show. */
function syllables(): Blob {
  const rate = 16000;
  const samples = new Int16Array(rate * 3);
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    // Five syllables a second or so, some louder, with a breath at 1.4s.
    const envelope =
      Math.max(0, Math.sin(t * Math.PI * 4.6)) ** 2 * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.7))) * (t > 1.3 && t < 1.6 ? 0 : 1);
    samples[i] = Math.round(envelope * 0.6 * 32767 * Math.sin(2 * Math.PI * (160 + 40 * Math.sin(t * 3)) * t));
  }
  const header = new DataView(new ArrayBuffer(44));
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) header.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  header.setUint32(4, 36 + samples.byteLength, true);
  text(8, 'WAVEfmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, rate, true);
  header.setUint32(28, rate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  text(36, 'data');
  header.setUint32(40, samples.byteLength, true);
  return new Blob([header, samples], { type: 'audio/wav' });
}

function Pinned({ tab, title }: { tab: string; title: string }) {
  const target = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLDivElement>(null);
  // popupIn draws the real popup outside React, into the host once both are mounted, until unmount.
  useEffect(() => {
    if (target.current === null || host.current === null) return;
    return popupIn(host.current, { tab, element: target.current });
  }, [tab]);
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="flex flex-wrap items-start gap-8">
        <button ref={target} type="button" className="rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-700">
          Open the playground
        </button>
        {/* `data-tab` tells the pinned popups apart in a task, as they share this line. */}
        <div ref={host} data-tab={tab} className="w-[360px]" />
      </div>
    </section>
  );
}
