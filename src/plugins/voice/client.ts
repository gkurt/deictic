/**
 * The voice plugin's page half: `start()` asks for the mic (the browser asks the user the first time) and
 * records it with `MediaRecorder`, sending what's spoken each second: the take's start to the `add` route,
 * the rest to `more/<id>`. So a take the page leaves in the middle of (a recording that goes on to another
 * page) is kept up to there. `stop` sends the last of it and lets the mic go, so the browser's recording
 * light goes out between takes.
 */
import { defineClientPlugin } from '#src/index.ts';

import type { Clip, Voice } from './index.ts';

/** What the browser can record, best first: Opus in WebM where it can (Chrome, Firefox), else MP4 (Safari). */
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
/** How often what's spoken is sent, in milliseconds: what a page load can lose of a take. */
const EVERY = 1000;

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
      const typeOf = () => (recorder.mimeType || mimeType || 'audio/webm').split(';')[0]!;
      // The clip, once its start is kept, and where it is, where what keeps it says (a `standalone` build's does).
      let id: string | undefined;
      let url: string | undefined;
      // One request at a time, in the order spoken: the audio is its pieces end to end. The first problem ends the sending.
      let sent: Promise<void> = Promise.resolve();
      const send = (body: Blob | undefined, last = false) => {
        sent = sent.then(async () => {
          if (id === undefined && body === undefined) throw new Error('voice: the clip is empty: speak for a moment longer');
          const route = id === undefined ? 'add' : `more/${id}${last ? '?last' : ''}`;
          const res = await request(route, { method: 'POST', headers: { 'content-type': typeOf() }, ...(body ? { body } : {}) });
          const answer = (await res.json()) as { id?: string; url?: string; problem?: string };
          if (answer.id === undefined) throw new Error(`voice: ${answer.problem ?? res.statusText}`);
          id = answer.id;
          url = answer.url ?? url;
        });
        return sent;
      };
      recorder.addEventListener('dataavailable', (e) => {
        // Heard only at `stop`, with the rest: a problem here is that one's.
        if (e.data.size > 0) send(new Blob([e.data], { type: typeOf() })).catch(() => {});
      });
      const started = Date.now();
      recorder.start(EVERY);
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
        soFar: () => (id === undefined ? undefined : { id, duration: Date.now() - started }),
        cancel: () => {
          void ended().then(release);
        },
        stop: async (): Promise<Clip> => {
          await ended();
          release();
          const duration = Date.now() - started;
          // The last piece came as it stopped. This says it's over, to what names the clip's place only then.
          await send(undefined, true);
          return { id: id!, url: url ?? `${base}__deictic/plugins/voice/clip/${id}`, duration, type: typeOf() };
        },
      };
    },
  }),
});
