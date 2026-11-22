#!/usr/bin/env node
/**
 * The `deictic` command. `init` sets a project up, for the person; the rest are for the agent that works the tasks,
 * as the skill says: the board, a watch, a task, and what a task carries. Each in `cli/`, loaded when it's run, so
 * `deictic task` doesn't load the parser `init` edits configs with. Run in the project, where its board and
 * `.deictic/` are: `npx deictic <command>`.
 */
const COMMANDS = {
  init: () => import('./cli/init.ts'),
  vb: () => import('./cli/vb.ts'),
  watch: () => import('./cli/watch.ts'),
  task: () => import('./cli/task.ts'),
  recording: () => import('./cli/recording.ts'),
  frame: () => import('./cli/frame.ts'),
  voice: () => import('./cli/voice.ts'),
  transcribe: () => import('./cli/transcribe.ts'),
};

type Name = keyof typeof COMMANDS;
const isName = (name: string | undefined): name is Name => name !== undefined && Object.hasOwn(COMMANDS, name);

async function help(): Promise<string> {
  const lines = await Promise.all(Object.values(COMMANDS).map(async (load) => `  ${(await load()).usage}`));
  return `Usage: deictic <command>\n\nSetting up:\n${lines[0]}\n\nFor the agent that works the tasks (the skill):\n${lines.slice(1).join('\n')}\n`;
}

const [name, ...args] = process.argv.slice(2);
if (!isName(name)) {
  const asked = name === undefined || name === '-h' || name === '--help' || name === 'help';
  (asked ? process.stdout : process.stderr).write(`${asked ? '' : `deictic: no command "${name}"\n\n`}${await help()}`);
  process.exit(asked ? 0 : 1);
}
if (name !== 'vb' && (args.includes('-h') || args.includes('--help'))) {
  process.stdout.write(`Usage: deictic ${(await COMMANDS[name]()).usage}\n`);
  process.exit(0);
}
await (await COMMANDS[name]()).run(args);
