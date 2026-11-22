#!/usr/bin/env node
/**
 * The `deictic` command: `deictic init` sets a project up (`tools/init.ts`). Run as `npx deictic init`, or with the
 * project's own runner (`pnpm dlx`, `bunx`), before deictic is installed.
 */
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

import { init } from './tools/init.ts';

const USAGE = `Usage: deictic init [options]

Installs deictic and what its recommended plugins use, adds it to your bundler's config, and offers the agent skill.

Options:
  --dry-run     say what it would do, and do none of it
  --no-install  don't install: say the command instead
  --skill       add the skill without asking
  --no-skill    don't add the skill: say the command instead
  -h, --help    this
`;

/** Asks a yes-or-no question on the terminal, yes by default. */
async function ask(question: string): Promise<boolean> {
  const lines = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return !/^n/i.test((await lines.question(`${question} (Y/n) `)).trim());
  } finally {
    lines.close();
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  allowNegative: true,
  options: {
    'dry-run': { type: 'boolean' },
    install: { type: 'boolean' },
    skill: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || positionals[0] !== 'init') {
  process.stdout.write(USAGE);
  process.exit(values.help ? 0 : 1);
}

try {
  await init({
    cwd: process.cwd(),
    install: values.install,
    skill: values.skill,
    dryRun: values['dry-run'],
    ask: process.stdin.isTTY && process.stdout.isTTY ? ask : undefined,
  });
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
