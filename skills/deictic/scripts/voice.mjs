#!/usr/bin/env node
// When something was said: the stretches of speech in voice clips, found by ffmpeg's silence detection. For a
// recording, in the recording's time, to line up with its timeline; for a task, each voice note on it too.
// Usage: voice.mjs <task | replay URL | recording ID | file | clip ID> [--noise -35] [--gap 0.4] [--wav dir] [--json]
// --wav writes each clip as 16 kHz mono WAV, what speech-to-text tools take. Needs ffmpeg on the PATH.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { clock, ffmpeg, parseArgs, voiceClips } from './lib.mjs';

const { options, rest } = parseArgs(process.argv.slice(2), ['json']);
const noise = Number(options.noise?.[0] ?? -35);
const gap = Number(options.gap?.[0] ?? 0.4);
const clips = await voiceClips(rest[0]);

const results = [];
for (const c of clips) {
  // ffmpeg reports silence; speech is what's between. MediaRecorder's webm has no duration, so it's measured.
  const run = ffmpeg(['-i', c.file, '-af', `silencedetect=noise=${noise}dB:d=${gap}`, '-f', 'null', '-']);
  const log = run.stderr;
  const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]) * 1000);
  const ends = [...log.matchAll(/silence_end: (-?[\d.]+)/g)].map((m) => Number(m[1]) * 1000);
  const times = [...log.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].at(-1);
  const length = times ? (Number(times[1]) * 3600 + Number(times[2]) * 60 + Number(times[3])) * 1000 : Math.max(0, ...ends);
  const speech = [];
  let from = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] - from > 150) speech.push([from, starts[i]]);
    from = ends[i] ?? length;
  }
  if (length - from > 150) speech.push([from, length]);
  if (options.wav) {
    const dir = resolve(options.wav[0]);
    mkdirSync(dir, { recursive: true });
    ffmpeg(['-y', '-loglevel', 'error', '-i', c.file, '-ar', '16000', '-ac', '1', '-sample_fmt', 's16', join(dir, `${c.id}.wav`)]);
  }
  results.push({ ...c, length, speech: speech.map(([a, b]) => ({ from: c.at + a, to: c.at + b })) });
}

if (options.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    const where = r.recording ? `in recording ${r.recording}, from ${clock(r.at)}` : 'a voice note';
    console.log(`clip ${r.id} (${where}), ${clock(r.length)} long: ${r.file}`);
    if (r.speech.length === 0) console.log('  no speech found: try a lower --noise, like -45');
    for (const s of r.speech) console.log(`  ${clock(s.from).padStart(6)} – ${clock(s.to).padStart(6)}  speech`);
    if (options.wav) console.log(`  wav: ${join(resolve(options.wav[0]), `${r.id}.wav`)}`);
  }
}
