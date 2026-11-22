/**
 * `deictic voice`: when something was said: the stretches of speech in voice clips, found by ffmpeg's silence
 * detection. For a recording, in the recording's time, to line up with its timeline; for a task, each voice note on
 * it too. `--wav` writes each clip as 16 kHz mono WAV, what speech-to-text tools take.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { clock } from './board.ts';
import { ffmpeg, voiceClips } from './find.ts';

export async function run(ref: string, values: { noise: string; gap: string; wav?: string; json?: boolean }): Promise<void> {
  const noise = Number(values.noise);
  const gap = Number(values.gap);
  const wav = values.wav === undefined ? undefined : resolve(values.wav);

  const results = [];
  for (const c of await voiceClips(ref)) {
    // ffmpeg reports silence; speech is what's between. MediaRecorder's webm has no duration, so it's measured.
    const log = ffmpeg(['-i', c.file, '-af', `silencedetect=noise=${noise}dB:d=${gap}`, '-f', 'null', '-']).log;
    const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]) * 1000);
    const ends = [...log.matchAll(/silence_end: (-?[\d.]+)/g)].map((m) => Number(m[1]) * 1000);
    const times = [...log.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].at(-1);
    const length = times ? (Number(times[1]) * 3600 + Number(times[2]) * 60 + Number(times[3])) * 1000 : Math.max(0, ...ends);
    const speech: [number, number][] = [];
    let from = 0;
    for (const [i, start] of starts.entries()) {
      if (start - from > 150) speech.push([from, start]);
      from = ends[i] ?? length;
    }
    if (length - from > 150) speech.push([from, length]);
    if (wav !== undefined) {
      mkdirSync(wav, { recursive: true });
      ffmpeg(['-y', '-loglevel', 'error', '-i', c.file, '-ar', '16000', '-ac', '1', '-sample_fmt', 's16', join(wav, `${c.id}.wav`)]);
    }
    results.push({ ...c, length, speech: speech.map(([a, b]) => ({ from: c.at + a, to: c.at + b })) });
  }

  if (values.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  for (const r of results) {
    const where = r.recording === undefined ? 'a voice note' : `in recording ${r.recording}, from ${clock(r.at)}`;
    console.log(`clip ${r.id} (${where}), ${clock(r.length)} long: ${r.file}`);
    if (r.speech.length === 0) console.log('  no speech found: try a lower --noise, like -45');
    for (const s of r.speech) console.log(`  ${clock(s.from).padStart(6)} – ${clock(s.to).padStart(6)}  speech`);
    if (wav !== undefined) console.log(`  wav: ${join(wav, `${r.id}.wav`)}`);
  }
}
