/**
 * `deictic transcribe`: what was said in voice clips, with when: Whisper on this machine, through transformers.js.
 * For a recording, the times are the recording's, to line up with its timeline. Nothing leaves the machine once the
 * model is downloaded.
 *
 * `--setup` puts @huggingface/transformers and the model in ~/.cache/deictic/transcribe (DEICTIC_CACHE moves it),
 * outside the project; an agent asks the person first. Models: tiny (~40 MB), base (~77 MB, the default), small
 * (~250 MB), large-v3-turbo (~800 MB), or any ONNX Whisper on Hugging Face by its ID. Needs ffmpeg on the PATH.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { clock, fail, ME, parseArgs } from './board.ts';
import { ffmpeg, voiceClips } from './find.ts';

export const usage = `transcribe <task | replay URL | recording ID | file | clip ID> [--model base] [--language en] [--json]   what was said
  transcribe --setup [--model base]   installs it, outside the project: ask the person first`;

// Pinned, so a setup installs what this was written against; move it on deliberately.
const TRANSFORMERS = '@huggingface/transformers@4.3.2';
const MODELS: Record<string, string> = {
  tiny: 'whisper-tiny',
  base: 'whisper-base',
  small: 'whisper-small',
  'large-v3-turbo': 'whisper-large-v3-turbo',
};

/** What of transformers.js this uses: its type isn't the project's, as it's installed outside it. */
interface Transformers {
  env: { cacheDir: string; allowRemoteModels: boolean };
  pipeline(
    task: 'automatic-speech-recognition',
    model: string,
    options: { dtype: string },
  ): Promise<
    (
      audio: Float32Array,
      options: Record<string, unknown>,
    ) => Promise<{ text: string; chunks?: { timestamp: [number, number | null]; text: string }[] }>
  >;
}

export async function run(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs(args, {
    setup: { type: 'boolean' },
    json: { type: 'boolean' },
    model: { type: 'string', default: 'base' },
    language: { type: 'string' },
  });
  const size = values.model;
  const named = MODELS[size];
  if (!size.includes('/') && named === undefined) fail(`--model is one of ${Object.keys(MODELS).join(', ')}, or a model ID`);
  const model = named === undefined ? size : `onnx-community/${named}`;
  const dir = join(process.env.DEICTIC_CACHE ?? join(homedir(), '.cache', 'deictic'), 'transcribe');
  const models = join(dir, 'models');
  const installed = existsSync(join(dir, 'node_modules', '@huggingface', 'transformers', 'package.json'));
  const downloaded = existsSync(join(models, ...model.split('/')));
  const again = `${ME} transcribe`;
  const sized = size === 'base' ? '' : ` --model ${size}`;

  if (values.setup) {
    mkdirSync(dir, { recursive: true });
    if (!existsSync(join(dir, 'package.json'))) writeFileSync(join(dir, 'package.json'), '{ "private": true }\n');
    if (!installed) {
      console.log(`Installing ${TRANSFORMERS} in ${dir}…`);
      const windows = process.platform === 'win32';
      const npm = ['install', '--prefix', dir, '--no-audit', '--no-fund', '--save-exact', TRANSFORMERS];
      const run = spawnSync(windows ? `npm ${npm.map((a) => `"${a}"`).join(' ')}` : 'npm', windows ? [] : npm, {
        stdio: 'inherit',
        shell: windows,
      });
      if (run.status !== 0) fail(`npm install failed (${run.error?.message ?? `exit ${run.status}`}).`);
    }
  } else if (!installed || !downloaded) {
    fail(
      `Local transcription isn't set up${installed ? ` with the ${size} model` : ''}. Ask the person first: it downloads ` +
        `${installed ? '' : `${TRANSFORMERS} (with ONNX Runtime, ~470 MB) and `}Whisper ${size} into ${dir}, outside ` +
        `the project; after that, audio is transcribed on this machine. On yes: ${again} --setup${sized} (--model small ` +
        `hears better, ~250 MB more). On no, don't ask again this session: work from ${ME} voice's times.`,
    );
  }

  const entry = createRequire(join(dir, 'package.json')).resolve('@huggingface/transformers');
  const transformers = (await import(pathToFileURL(entry).href)) as Transformers;
  transformers.env.cacheDir = models;
  // Only setup downloads; a transcription uses what's here.
  transformers.env.allowRemoteModels = values.setup === true;
  if (values.setup) console.log(`Downloading ${model} (quantized) into ${models}…`);
  const asr = await transformers.pipeline('automatic-speech-recognition', model, { dtype: 'q8' });
  if (values.setup) {
    console.log(`Ready: ${again} <task>${sized}`);
    if (positionals[0] === undefined) return;
  }

  const results = [];
  for (const c of await voiceClips(positionals[0])) {
    // Whisper takes 16 kHz mono samples; ffmpeg decodes the clip (webm, ogg or mp4) to them.
    const raw = ffmpeg(['-loglevel', 'error', '-i', c.file, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-']).stdout;
    const audio = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength - (raw.byteLength % 4)));
    const seconds = audio.length / 16000;
    const out = await asr(audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(values.language === undefined ? {} : { language: values.language }),
    });
    const said = (out.chunks ?? [{ timestamp: [0, seconds] as [number, number], text: out.text }]).map(
      ({ timestamp: [from, to], text }) => ({
        from: c.at + from * 1000,
        to: c.at + (to ?? seconds) * 1000,
        text: text.trim(),
      }),
    );
    results.push({ ...c, text: out.text.trim(), said });
  }

  if (values.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  for (const r of results) {
    console.log(`clip ${r.id} (${r.recording === undefined ? 'a voice note' : `in recording ${r.recording}, from ${clock(r.at)}`}):`);
    for (const s of r.said) console.log(`  ${clock(s.from).padStart(6)} – ${clock(s.to).padStart(6)}  ${s.text}`);
  }
}
