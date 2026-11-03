/**
 * The voice plugin's page half: `start()` asks for the mic (the browser asks the user the first time) and
 * records it with `MediaRecorder`. `stop` sends the take to the `add` route and lets the mic go, so the
 * browser's recording light goes out between takes.
 */
import { defineClientPlugin } from '#src/index.ts';

import type { Clip, Voice } from './index.ts';

/** What the browser can record, best first: Opus in WebM where it can (Chrome, Firefox), else MP4 (Safari). */
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

export default defineClientPlugin<never, never, Voice>({
  name: 'voice',
  setup: ({ base, request }) => ({
    start: async () => {
      if (typeof MediaRecorder === 'undefined' || navigator.mediaDevices?.getUserMedia === undefined)
        throw new Error("voice: this browser can't record the mic here: it needs a secure page (https or localhost)");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((e: unknown) => {
        throw new Error(`voice: the mic isn't available: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
      });
      const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType === undefined ? {} : { mimeType });
      const chunks: Blob[] = [];
      recorder.addEventListener('dataavailable', (e) => chunks.push(e.data));
      const started = Date.now();
      recorder.start();
      const release = () => {
        for (const track of stream.getTracks()) track.stop();
      };
      const ended = () =>
        new Promise<void>((done) => {
          if (recorder.state === 'inactive') return done();
          recorder.addEventListener('stop', () => done(), { once: true });
          recorder.stop();
        });

      return {
        started,
        stream,
        cancel: () => {
          void ended().then(release);
        },
        stop: async (): Promise<Clip> => {
          await ended();
          release();
          const duration = Date.now() - started;
          const type = (recorder.mimeType || mimeType || 'audio/webm').split(';')[0]!;
          const res = await request('add', { method: 'POST', headers: { 'content-type': type }, body: new Blob(chunks, { type }) });
          const { id, problem } = (await res.json()) as { id?: string; problem?: string };
          if (id === undefined) throw new Error(`voice: ${problem ?? res.statusText}`);
          return { id, url: `${base}__deictic/plugins/voice/clip/${id}`, duration, type };
        },
      };
    },
  }),
});
