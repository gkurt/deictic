#!/usr/bin/env node
/**
 * The `deictic` command. `init` sets a project up and `clean` deletes what it kept, for the person; the rest are for
 * the agent that works the tasks, as the skill says: the board, a watch, a task, and what a task carries. Each is
 * declared here, its arguments and options with what they do, which is all `--help` needs; what it runs is in `cli/`,
 * imported only when it's run, so `deictic task` doesn't load the parser `init` edits configs with. Run in the
 * project, where its board and `.deictic/` are: `npx deictic <command>`.
 */
import { Argument, Command } from 'commander';

/** A repeatable option's values, in order. */
const all = (value: string, previous: string[] | undefined) => [...(previous ?? []), value];
const RECORDING = 'a task (68), a replay URL, a recording ID or a JSON file';
const CLIP = 'a task, a replay URL, a recording ID, an audio file or a clip ID';

const program = new Command('deictic')
  .usage('<command> [options]')
  .enablePositionalOptions()
  .helpOption('-h, --help', 'says what a command takes')
  .showHelpAfterError('(add --help for what it takes)')
  .addHelpText('after', '\nRun in the project. deictic help <command>, or <command> --help, says what it takes.');

program.commandsGroup('Setting up and cleaning up:');
// Here, not under a heading of its own, which a lone `help` would get.
program.helpCommand('help [command]', 'says what a command takes');

program
  .command('init')
  .description('sets deictic up in this project')
  .option('--dry-run', 'says what it would do, and does none of it')
  .option('--no-install', "doesn't install: says the command instead")
  .option('--skill', 'adds the agent skill without asking')
  .option('--no-skill', "doesn't add the agent skill: says the command instead")
  .action(async (options) => (await import('./cli/init.ts')).run(options));

program
  .command('clean')
  .description('deletes what deictic kept, after saying what and how big and asking')
  .addArgument(
    new Argument('[parts...]', 'what to delete: shots, recordings and voice clips by default').choices([
      'screenshots',
      'recordings',
      'voice',
      'history',
      'board',
      'all',
      'transcribe',
    ]),
  )
  .option('-y, --yes', "deletes without asking: with no terminal to ask on, it doesn't delete without it")
  .addHelpText(
    'after',
    '\nhistory (undo) and board (the local board, its tasks) only with the dev server stopped. all is everything in' +
      "\nthe project's .deictic/; transcribe is the transcription model, outside it, which every project shares.",
  )
  .action(async (parts: string[], options) => (await import('./cli/clean.ts')).run(parts, options));

program.commandsGroup('For the agent that works the tasks (the skill):');

program
  .command('vb')
  .description('the board on the dev server: deictic vb whoami, deictic vb tasks claim 68 --lease 30m')
  .argument('[args...]', 'anything vb takes')
  // All of it is vb's, --help too.
  .helpOption(false)
  .allowUnknownOption()
  .passThroughOptions()
  .action(async (args: string[]) => (await import('./cli/vb.ts')).run(args));

program
  .command('watch')
  .description('a line per new task, reply and cancellation')
  .argument('[channel]', 'the channel', 'deictic')
  .option('--idle <time>', 'ends once the channel has had nothing for this long: 30m, 45s, 1h', '20m')
  .option('--once', 'ends at the first thing to act on')
  .option('--label <key=value>', 'only tasks with this label (repeatable)', all)
  .action(async (channel: string, options) => (await import('./cli/watch.ts')).run(channel, options));

program
  .command('task')
  .description('a task briefly: what was asked, by whom, who holds it, what is attached')
  .argument('<id>', 'the task: 68 or #68')
  .option('--out <dir>', 'downloads what is attached here')
  .action(async (id: string, options) => (await import('./cli/task.ts')).run(id, options));

program
  .command('recording')
  .description(
    "a recording as a timeline: what the person did and what went wrong, with a count of the page's other requests, console lines and React commits; or the part of it asked for",
  )
  .argument('<recording>', RECORDING)
  .option('--nth <n>', "a task's nth recording", '1')
  .option(
    '--only <kinds>',
    'these kinds of line: console, request, react, page, click, input, scroll, resize, marks, voice (repeatable)',
    all,
  )
  .option('--all', 'every line: every request, console line and React commit too')
  .option('--problems', 'errors, warnings, requests that failed and React commits slower than a frame')
  .option('--from <seconds>', 'from this far in')
  .option('--to <seconds>', 'to this far in')
  .option('--around <seconds>', 'every line of the 3 seconds either side of this')
  .option('--grep <text>', 'lines with this in them, in any case, of every line')
  .option('--full', "all of each line: where it was logged from, a request's headers and bodies, a React commit's components")
  .option('--json', 'as JSON')
  .action(async (ref: string, options) => (await import('./cli/recording.ts')).run(ref, options));

program
  .command('frame')
  .description('PNGs of a recording, as the replay draws it, marks and all (needs the dev server)')
  .argument('<recording>', RECORDING)
  .option('--nth <n>', "a task's nth recording", '1')
  .option('--at <seconds>', 'a frame this far in (repeatable); by default after each change to the marks, and the end', all)
  .option('--every <seconds>', 'a frame this often')
  .option('--out <dir>', 'where the PNGs go, a temporary folder by default')
  .option('--base <url>', "the dev server, where it's not the recorded page's origin")
  .action(async (ref: string, options) => (await import('./cli/frame.ts')).run(ref, options));

program
  .command('voice')
  .description("when speech happens in voice clips, in the recording's time")
  .argument('<clip>', CLIP)
  .option('--noise <dB>', 'what counts as silence; lower hears quieter speech', '-35')
  .option('--gap <seconds>', 'the shortest silence between stretches of speech', '0.4')
  .option('--wav <dir>', 'also writes each clip here as 16 kHz WAV')
  .option('--json', 'as JSON')
  .action(async (ref: string, options) => (await import('./cli/voice.ts')).run(ref, options));

program
  .command('transcribe')
  .description('what was said in voice clips, on this machine, with when')
  .argument('[clip]', CLIP)
  .option('--setup', 'installs it, outside the project: ask the person first')
  .option('--model <size>', 'tiny, base, small, large-v3-turbo, or a model ID', 'base')
  .option('--language <code>', 'the language spoken (en), rather than guessed')
  .option('--json', 'as JSON')
  .action(async (ref: string | undefined, options) => (await import('./cli/transcribe.ts')).run(ref, options));

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}
await program.parseAsync();
