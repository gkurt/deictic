/**
 * Waveforms: a clip's, read off its audio, drawn as bars with what's played in the accent; and a mic's live,
 * a meter scrolling left as it hears. For the lightbox's player and whatever records the mic (the task
 * panel's Voice, the recording toolbar's mic). Bars, not a line: they read at any size, and at a glance.
 */

/**
 * How loud each of `bars` stretches of the clip at `url` is, from 0 to 1, the loudest 1, and how long it is in
 * seconds: MediaRecorder's webm doesn't say until it's played through.
 */
export async function peaksOf(url: string, bars: number): Promise<{ peaks: number[]; duration: number }> {
  const data = await (await fetch(url)).arrayBuffer();
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(data);
    const samples = audio.getChannelData(0);
    const size = Math.max(1, Math.floor(samples.length / bars));
    const peaks: number[] = [];
    for (let b = 0; b < bars; b++) {
      // The stretch's loudness as its RMS: a peak would make every click a wall.
      let sum = 0;
      const from = b * size;
      for (let i = from; i < Math.min(samples.length, from + size); i++) sum += samples[i]! * samples[i]!;
      peaks.push(Math.sqrt(sum / size));
    }
    const top = Math.max(...peaks, 1e-6);
    return { peaks: peaks.map((p) => p / top), duration: audio.duration };
  } finally {
    void context.close();
  }
}

export interface Colors {
  /** What's played. */
  played: string;
  /** What isn't, yet. */
  rest: string;
}

/** Draws `peaks` as bars across `canvas`, centred on its middle, the share `progress` (0–1) of them played. */
export function drawBars(canvas: HTMLCanvasElement, peaks: readonly number[], progress: number, colors: Colors): void {
  const { width, height } = fit(canvas);
  const g = canvas.getContext('2d');
  if (g === null) return;
  g.clearRect(0, 0, width, height);
  const step = width / Math.max(1, peaks.length);
  const bar = Math.max(1, step * 0.6);
  const dpr = devicePixelRatio;
  peaks.forEach((p, i) => {
    // Silence still shows as a sliver, so the clip's length reads from end to end.
    const h = Math.max(2 * dpr, p * height * 0.9);
    g.fillStyle = (i + 0.5) / peaks.length <= progress ? colors.played : colors.rest;
    g.fillRect(i * step + (step - bar) / 2, (height - h) / 2, bar, h);
  });
}

/**
 * The mic's level, live, as bars scrolling in from the right, drawn on `canvas` until the answer's called.
 * It listens to `stream` on its own; the recording goes on as it was.
 */
export function liveWaveform(canvas: HTMLCanvasElement, stream: MediaStream, colors: Colors): () => void {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const levels: number[] = [];
  let frame = 0;
  let last = 0;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    // About 20 bars a second, whatever the display's rate.
    if (now - last < 50) return;
    last = now;
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    // Speech sits low in the range: lifted so a normal voice fills most of the height.
    levels.push(Math.min(1, Math.sqrt(sum / samples.length) * 4));
    const room = Math.max(8, Math.floor(canvas.clientWidth / 4));
    if (levels.length > room) levels.splice(0, levels.length - room);
    drawBars(canvas, [...Array<number>(room - levels.length).fill(0), ...levels], 1, colors);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    void context.close();
  };
}

/** Sizes the canvas's pixels to its box, at the display's density: what it draws stays sharp. */
function fit(canvas: HTMLCanvasElement): { width: number; height: number } {
  const width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
  const height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}
