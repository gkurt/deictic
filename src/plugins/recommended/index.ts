/**
 * `deictic/recommended`: the plugins for describing a change rather than making it. Alt-click an element, say what
 * should change, attach a screenshot to draw on, a screen recording or your voice, and it goes to a Vercel Board.
 *
 * Only the server halves, as every factory is: each names its page half, which the integration imports. A plugin
 * outside the preset (Tailwind, your own) goes beside it: `plugins: [...recommended(), tailwind()]`.
 */
import type { ServerPlugin } from '#src/index.ts';
import { annotations, type AnnotationsOptions } from '#src/plugins/annotations/index.ts';
import { recordings, type RecordingsOptions } from '#src/plugins/recordings/index.ts';
import { screenshots, type ScreenshotsOptions } from '#src/plugins/screenshots/index.ts';
import { tasks, type TasksOptions } from '#src/plugins/tasks/index.ts';
import { voice, type VoiceOptions } from '#src/plugins/voice/index.ts';

/** Each plugin's options, by its name, or `false` to leave it out. */
export interface RecommendedOptions {
  tasks?: TasksOptions | false;
  screenshots?: ScreenshotsOptions | false;
  annotations?: AnnotationsOptions | false;
  recordings?: RecordingsOptions | false;
  voice?: VoiceOptions | false;
}

/** Tasks, screenshots, annotations, recordings and voice, in that order: the order of their tabs. */
export function recommended(options: RecommendedOptions = {}): ServerPlugin[] {
  const plugins: ServerPlugin[] = [];
  if (options.tasks !== false) plugins.push(tasks(options.tasks));
  if (options.screenshots !== false) plugins.push(screenshots(options.screenshots));
  if (options.annotations !== false) plugins.push(annotations(options.annotations));
  if (options.recordings !== false) plugins.push(recordings(options.recordings));
  if (options.voice !== false) plugins.push(voice(options.voice));
  return plugins;
}

export default recommended;
