/**
 * `deictic/recommended`: the plugins for describing a change rather than making it. Alt-click an element, say what
 * should change, attach a screenshot to draw on, a screen recording or your voice, and it goes to a Vercel Board.
 * A recording has the page's console and its requests in it too, and in a React project a task has the props and
 * state of the components that wrote its element.
 *
 * Only the server halves, as every factory is: each names its page half, which the integration imports. A plugin
 * outside the preset (Tailwind, your own) goes beside it: `plugins: [...deicticRecommended(), tailwind()]`. Named for
 * deictic, as a config imports other presets called `recommended`.
 */
import type { ServerPlugin } from '#src/index.ts';
import { annotations, type AnnotationsOptions } from '#src/plugins/annotations/index.ts';
import { logs, type LogsOptions } from '#src/plugins/logs/index.ts';
import { network, type NetworkOptions } from '#src/plugins/network/index.ts';
import { type ReactOptions, reactState } from '#src/plugins/react/index.ts';
import { recordings, type RecordingsOptions } from '#src/plugins/recordings/index.ts';
import { screenshots, type ScreenshotsOptions } from '#src/plugins/screenshots/index.ts';
import { tasks, type TasksOptions } from '#src/plugins/tasks/index.ts';
import { voice, type VoiceOptions } from '#src/plugins/voice/index.ts';
import { installed } from '#src/tools/packages.ts';

/** Each plugin's options, by its name, or `false` to leave it out. */
export interface RecommendedOptions {
  tasks?: TasksOptions | false;
  screenshots?: ScreenshotsOptions | false;
  annotations?: AnnotationsOptions | false;
  recordings?: RecordingsOptions | false;
  voice?: VoiceOptions | false;
  /** The console's lines in a recording. */
  logs?: LogsOptions | false;
  /** The page's requests in a recording, masked. */
  network?: NetworkOptions | false;
  /**
   * The props, state and hooks of the components that wrote a task's element: where the project has React (found from
   * the working directory, where the dev server starts), unless it's `false`.
   */
  react?: ReactOptions | false;
}

/**
 * Tasks, screenshots, annotations, recordings and voice, in that order, the order of their tabs, then what a
 * recording has besides the page: logs and network, and React's state where the project has React.
 */
export function deicticRecommended(options: RecommendedOptions = {}): ServerPlugin[] {
  const plugins: ServerPlugin[] = [];
  if (options.tasks !== false) plugins.push(tasks(options.tasks));
  if (options.screenshots !== false) plugins.push(screenshots(options.screenshots));
  if (options.annotations !== false) plugins.push(annotations(options.annotations));
  if (options.recordings !== false) plugins.push(recordings(options.recordings));
  if (options.voice !== false) plugins.push(voice(options.voice));
  // Nothing without recordings to be in.
  if (options.recordings !== false && options.logs !== false) plugins.push(logs(options.logs));
  if (options.recordings !== false && options.network !== false) plugins.push(network(options.network));
  // Its page half reads React's fibers: nothing to read without React, and bippy to install for nothing.
  if (options.react !== false && (options.react !== undefined || installed(process.cwd(), 'react')))
    plugins.push(reactState(options.react));
  return plugins;
}

/** @deprecated `deicticRecommended`, as `deictic init` writes it now: this name clashes with other presets'. */
export const recommended = deicticRecommended;

export default deicticRecommended;
