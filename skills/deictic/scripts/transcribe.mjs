#!/usr/bin/env node
// What was said in voice clips, with when: Whisper on this machine, through transformers.js. For a recording, the
// times are the recording's, to line up with its timeline. Nothing leaves the machine once the model is downloaded.
//
// Usage: transcribe.mjs <task | replay URL | recording ID | file | clip ID> [--model base] [--language en] [--json]
//        transcribe.mjs --setup [--model base]    installs it: ask the person first
//
// Setup puts @huggingface/transformers and the model in ~/.cache/deictic/transcribe (DEICTIC_CACHE moves it),
// outside the project. Models: tiny (~40 MB), base (~77 MB, the default), small (~250 MB), large-v3-turbo
// (~800 MB), or any ONNX Whisper on Hugging Face by its ID. Needs ffmpeg on the PATH.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { clock, fail, ffmpeg, parseArgs, voiceClips } from './lib.mjs';

// Pinned, so a setup installs what the script was written against; move it on deliberately.
const TRANSFORMERS = '@huggingface/transformers@4.3.2';
const MODELS = { tiny: 'whisper-tiny', base: 'whisper-base', small: 'whisper-small', 'large-v3-turbo': 'whisper-large-v3-turbo' };

const { options, rest } = parseArgs(process.argv.slice(2), ['setup', 'json']);
const size = options.model?.[0] ?? 'base';
const model = size.includes('/')
  ? size
  : `onnx-community/${MODELS[size] ?? fail(`--model is one of ${Object.keys(MODELS).join(', ')}, or a model ID`)}`;
const dir = join(process.env.DEICTIC_CACHE ?? join(homedir(), '.cache', 'deictic'), 'transcribe');
const models = join(dir, 'models');
const installed = existsSync(join(dir, 'node_modules', '@huggingface', 'transformers', 'package.json'));
const downloaded = existsSync(join(models, ...model.split('/')));

if (options.setup) {
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, 'package.json'))) writeFileSync(join(dir, 'package.json'), '{ "private": true }\n');
  if (!installed) {
    console.log(`Installing ${TRANSFORMERS} in ${dir}…`);
    const windows = process.platform === 'win32';
    const args = ['install', '--prefix', dir, '--no-audit', '--no-fund', '--save-exact', TRANSFORMERS];
    const run = spawnSync(windows ? `npm ${args.map((a) => `"${a}"`).join(' ')}` : 'npm', windows ? [] : args, {
      stdio: 'inherit',
      shell: windows,
    });
    if (run.status !== 0) fail(`npm install failed (${run.error?.message ?? `exit ${run.status}`}).`);
  }
} else if (!installed || !downloaded) {
  fail(
    `Local transcription isn't set up${installed ? ` with the ${size} model` : ''}. Ask the person first: it downloads ` +
      `${installed ? '' : `${TRANSFORMERS} (with ONNX Runtime, ~470 MB) and `}Whisper ${size} into ${dir}, outside ` +
      `the project; after that, audio is transcribed on this machine. On yes: node ${process.argv[1]} --setup` +
      (size === 'base' ? '' : ` --model ${size}`),
  );
}

const transformers = await import(pathToFileURL(createRequire(join(dir, 'package.json')).resolve('@huggingface/transformers')).href);
transformers.env.cacheDir = models;
// Only setup downloads; a transcription uses what's here.
transformers.env.allowRemoteModels = Boolean(options.setup);
if (options.setup) console.log(`Downloading ${model} (quantized) into ${models}…`);
const asr = await transformers.pipeline('automatic-speech-recognition', model, { dtype: 'q8' });
if (options.setup) {
  console.log(`Ready: node ${process.argv[1]} <task>${size === 'base' ? '' : ` --model ${size}`}`);
  if (rest[0] === undefined) process.exit(0);
}

const results = [];
for (const c of await voiceClips(rest[0])) {
  // Whisper takes 16 kHz mono samples; ffmpeg decodes the clip (webm, ogg or mp4) to them.
  const raw = ffmpeg(['-loglevel', 'error', '-i', c.file, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], 'buffer').stdout;
  const audio = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength - (raw.byteLength % 4)));
  const out = await asr(audio, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    ...(options.language ? { language: options.language[0] } : {}),
  });
  const said = (out.chunks ?? [{ timestamp: [0, audio.length / 16000], text: out.text }]).map(({ timestamp: [from, to], text }) => ({
    from: c.at + from * 1000,
    to: c.at + (to ?? audio.length / 16000) * 1000,
    text: text.trim(),
  }));
  results.push({ ...c, text: out.text.trim(), said });
}

if (options.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    console.log(`clip ${r.id} (${r.recording ? `in recording ${r.recording}, from ${clock(r.at)}` : 'a voice note'}):`);
    for (const s of r.said) console.log(`  ${clock(s.from).padStart(6)} – ${clock(s.to).padStart(6)}  ${s.text}`);
  }
}
