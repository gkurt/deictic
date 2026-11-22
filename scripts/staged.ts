// The pre-commit hook (`.githooks/pre-commit`): lint autofix, then format, the staged files, and stage them again.
//
// A file with unstaged changes too is refused, as `bun fmt --staged` refuses it: fixing and staging it again would
// commit the changes that weren't staged.

const git = (...args: string[]) => {
  const run = Bun.spawnSync(['git', ...args], { stderr: 'inherit' });
  if (!run.success) process.exit(run.exitCode || 1);
  return run.stdout.toString().split('\0').filter(Boolean);
};

const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z');
if (staged.length === 0) process.exit(0);

const unstaged = new Set(git('diff', '--name-only', '-z'));
const partly = staged.filter((file) => unstaged.has(file));
if (partly.length > 0) {
  console.error(`${partly.join(', ')} ${partly.length === 1 ? 'has' : 'have'} both staged and unstaged changes, so nothing was fixed`);
  console.error('  Stage the rest with git add, or put it away with git stash --keep-index. Then commit again.');
  process.exit(1);
}

const lint = Bun.spawnSync(['oxlint', '--fix', '--no-error-on-unmatched-pattern', ...staged], { stdio: ['inherit', 'inherit', 'inherit'] });
git('add', '--', ...staged);
if (!lint.success) process.exit(lint.exitCode || 1);

const format = Bun.spawnSync(['bun', 'fmt', '--staged'], { stdio: ['inherit', 'inherit', 'inherit'] });
process.exit(format.exitCode);
