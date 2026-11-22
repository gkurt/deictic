/**
 * `deictic init`: the recommended setup in a project, in one step. It installs deictic and what the recommended
 * plugins import, with the project's package manager and as the project's own dev dependencies (deictic, the
 * page's bundle and the skill all find them from the project, so they can't come in through another package), adds
 * deictic to the bundler's config where it can find the place, and offers the agent skill.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';

import MagicString from 'magic-string';
import { type Expression, type ObjectExpression, parseSync, type Program } from 'oxc-parser';

import { recommended } from '#src/plugins/recommended/index.ts';

import { installCommand, packageManager, readJson, runnerOf } from '#src/tools/packages.ts';

import { fail } from './board.ts';
import { addToBunfig, addToServer, BY_HAND, MODULE, PLUGIN, serverOf } from './bun.ts';
import { addFirst, addImports, eolOf, indentAt } from './edit.ts';

export type Bundler = 'next' | 'astro' | 'vite' | 'rspack' | 'webpack' | 'bun';

interface Setup {
  /** The config files it looks for, in order. */
  files: string[];
  /** The module deictic's integration comes from, and its name there. */
  from: string;
  name: string;
  /** What goes in the config: in its `list`, or wrapped around the whole of it with `wrap`. */
  list?: string;
  value: string;
  wrap?: boolean;
  /** The snippet for a config it can't edit. */
  snippet: string;
}

const extensions = (base: string) => ['ts', 'mts', 'js', 'mjs', 'cts', 'cjs'].map((e) => `${base}.${e}`);
const PLUGINS = '{ plugins: recommended() }';

const SETUPS: Record<Exclude<Bundler, 'bun'>, Setup> = {
  next: {
    files: extensions('next.config'),
    from: 'deictic/next',
    name: 'withDeictic',
    value: PLUGINS,
    wrap: true,
    snippet: `export default withDeictic(nextConfig, ${PLUGINS});`,
  },
  astro: {
    files: extensions('astro.config'),
    from: 'deictic/astro',
    name: 'deictic',
    list: 'integrations',
    value: `deictic(${PLUGINS})`,
    snippet: `export default defineConfig({ integrations: [deictic(${PLUGINS})] });`,
  },
  vite: {
    files: extensions('vite.config'),
    from: 'deictic/vite',
    name: 'deictic',
    list: 'plugins',
    value: `deictic(${PLUGINS})`,
    snippet: `export default defineConfig({ plugins: [react(), deictic(${PLUGINS})] });`,
  },
  rspack: {
    files: extensions('rspack.config'),
    from: 'deictic/webpack',
    name: 'DeicticPlugin',
    list: 'plugins',
    value: `new DeicticPlugin(${PLUGINS})`,
    snippet: `export default { plugins: [new DeicticPlugin(${PLUGINS})] };`,
  },
  webpack: {
    files: extensions('webpack.config'),
    from: 'deictic/webpack',
    name: 'DeicticPlugin',
    list: 'plugins',
    value: `new DeicticPlugin(${PLUGINS})`,
    snippet: `export default { plugins: [new DeicticPlugin(${PLUGINS})] };`,
  },
};

/** The project's root: the nearest folder with a package.json, from `dir` up. */
export function rootOf(dir: string): string | undefined {
  for (let at = dir; ; at = dirname(at)) {
    if (existsSync(join(at, 'package.json'))) return at;
    if (dirname(at) === at) return undefined;
  }
}

/** The project's dependencies and dev dependencies, by name. */
function dependenciesOf(root: string): Set<string> {
  const manifest = readJson(join(root, 'package.json')) ?? {};
  return new Set([manifest.dependencies, manifest.devDependencies].flatMap((d) => Object.keys((d as object | undefined) ?? {})));
}

/** The bundler the project runs its dev server with, from its dependencies, or none deictic knows. */
export function bundlerOf(root: string): Bundler | undefined {
  const has = dependenciesOf(root);
  if (has.has('next')) return 'next';
  if (has.has('astro')) return 'astro';
  if (has.has('vite') || SETUPS.vite.files.some((f) => existsSync(join(root, f)))) return 'vite';
  if (has.has('@rspack/core') || has.has('@rspack/cli')) return 'rspack';
  if (has.has('webpack')) return 'webpack';
  // Bun's own bundler only where a server of the project's has it bundle a page: not every project Bun runs.
  if (serverOf(root) !== undefined) return 'bun';
  return undefined;
}

/** What the recommended setup imports, for the bundler: launch-editor opens files under webpack, which has no launcher. */
export function packagesFor(bundler: Bundler | undefined): string[] {
  const plugins = recommended().flatMap((p) => p.packages ?? []);
  return ['deictic', ...plugins, ...(bundler === 'webpack' || bundler === 'rspack' ? ['launch-editor'] : [])];
}

type Node = Expression | ObjectExpression;

/**
 * The object an expression comes to: through `defineConfig(…)`, `(…)`, `satisfies`, a function's return and a top-level
 * `const`. Not through another call: in `mergeConfig(base, {…})` or webpack-merge's `merge(common, {…})` the first
 * argument is a base the project may build with too, and the plugin isn't the base's.
 */
function objectOf(node: Node | null | undefined, program: Program, depth = 0): ObjectExpression | undefined {
  if (node == null || depth > 8) return undefined;
  const next = (n: Node | null | undefined) => objectOf(n, program, depth + 1);
  if (node.type === 'ObjectExpression') return node;
  if (node.type === 'ParenthesizedExpression' || node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression')
    return next(node.expression);
  if (node.type === 'CallExpression') {
    const { callee } = node;
    const named = (callee.type === 'Identifier' ? callee : callee.type === 'MemberExpression' ? callee.property : undefined) as
      { type: string; name?: string } | undefined;
    const [first] = node.arguments;
    if (named?.name !== 'defineConfig' || first === undefined || first.type === 'SpreadElement') return undefined;
    return next(first);
  }
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    const body = node.body;
    if (body === null) return undefined;
    if (body.type !== 'BlockStatement') return next(body);
    const returned = body.body.findLast((s) => s.type === 'ReturnStatement');
    return returned?.type === 'ReturnStatement' ? next(returned.argument) : undefined;
  }
  if (node.type !== 'Identifier') return undefined;
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type !== 'VariableDeclaration') continue;
    const found = declaration.declarations.find((d) => d.id.type === 'Identifier' && d.id.name === node.name);
    if (found !== undefined) return next(found.init);
  }
  return undefined;
}

/** The config's exported value: `export default …` or `module.exports = …`, and whether it's CommonJS. */
function exportedOf(program: Program): { value: Expression; commonjs: boolean } | undefined {
  for (const statement of program.body) {
    if (statement.type === 'ExportDefaultDeclaration') {
      const value = statement.declaration;
      return value.type.endsWith('Declaration') && value.type !== 'FunctionDeclaration'
        ? undefined
        : { value: value as Expression, commonjs: false };
    }
    if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'AssignmentExpression') continue;
    const { left, right } = statement.expression;
    const exports =
      left.type === 'MemberExpression' &&
      left.object.type === 'Identifier' &&
      left.object.name === 'module' &&
      left.property.type === 'Identifier' &&
      left.property.name === 'exports';
    if (exports) return { value: right, commonjs: true };
  }
  return undefined;
}

/**
 * The config with deictic added, or nothing where it can't tell where: deictic's import beside the config's, and its
 * plugin last in the list (`plugins`, `integrations`), or the config wrapped (Next's). Written in the config's quotes,
 * semicolons and line endings.
 */
export function addToConfig(bundler: Exclude<Bundler, 'bun'>, file: string, code: string): string | undefined {
  const setup = SETUPS[bundler];
  const { program, errors } = parseSync(file, code, { preserveParens: false });
  if (errors.length > 0) return undefined;
  const exported = exportedOf(program);
  if (exported === undefined) return undefined;
  const eol = eolOf(code);
  const out = new MagicString(code);

  if (setup.wrap) {
    out.appendLeft(exported.value.start, `${setup.name}(`);
    out.appendRight(exported.value.end, `, ${setup.value})`);
  } else {
    const object = objectOf(exported.value, program);
    if (object === undefined || !addTo(out, code, object, setup.list!, setup.value, eol)) return undefined;
  }

  const lines: [string, string][] = [
    ['{ recommended }', 'deictic/recommended'],
    [`{ ${setup.name} }`, setup.from],
  ];
  addImports(out, program, code, lines, exported.commonjs);
  return out.toString();
}

/** Adds `value` last in the object's array `list`, or the list with it, as the object is laid out. False where `list` isn't an array. */
function addTo(out: MagicString, code: string, object: ObjectExpression, list: string, value: string, eol: string): boolean {
  const property = object.properties.find(
    (p) =>
      p.type === 'Property' &&
      !p.computed &&
      ((p.key.type === 'Identifier' && p.key.name === list) || (p.key.type === 'Literal' && p.key.value === list)),
  );
  if (property !== undefined) {
    if (property.type !== 'Property') return false;
    let array = property.value;
    while (array.type === 'TSAsExpression' || array.type === 'TSSatisfiesExpression') array = array.expression;
    if (array.type !== 'ArrayExpression') return false;
    const last = array.elements.findLast((e) => e !== null);
    if (last == null) {
      out.appendLeft(array.start + 1, value);
      return true;
    }
    const multiline = code.slice(array.start, array.end).includes('\n');
    out.appendLeft(last.end, multiline ? `,${eol}${indentAt(code, last.start)}${value}` : `, ${value}`);
    return true;
  }
  addFirst(out, code, object.start, object.properties[0], `${list}: [${value}]`);
  return true;
}

export interface InitOptions {
  /** Where it runs: the project is the nearest folder with a package.json. */
  cwd: string;
  /** Installs the packages; false only says the command. */
  install?: boolean;
  /** Adds the skill (true), says how (false), or asks (undefined, on a terminal; says how elsewhere). */
  skill?: boolean;
  /** Says what it would do, and does none of it. */
  dryRun?: boolean;
  log?: (line: string) => void;
  /** Runs a command in the project, and answers whether it succeeded. */
  run?: (command: string, cwd: string) => boolean;
  ask?: (question: string) => Promise<boolean>;
}

const runIn = (command: string, cwd: string) => spawnSync(command, { cwd, stdio: 'inherit', shell: true }).status === 0;

/** Sets the project up; throws what to do where it can't. */
export async function init(options: InitOptions): Promise<void> {
  const { install = true, dryRun = false, log = console.log, run = runIn } = options;
  const root = rootOf(options.cwd);
  if (root === undefined) throw new Error('deictic: no package.json here or above: run it in your project');
  const manager = packageManager(root);
  const bundler = bundlerOf(root);
  const has = dependenciesOf(root);

  const wanted = packagesFor(bundler).filter((p) => !has.has(p));
  const command = installCommand(manager, wanted, root);
  if (wanted.length === 0) {
    log('deictic: its packages are installed');
  } else if (!install || dryRun) {
    log(`deictic: install them with ${command}`);
  } else {
    log(`deictic: ${command}`);
    if (!run(command, root)) throw new Error(`deictic: the install failed: run ${command} yourself, then this again`);
  }

  configure(root, bundler, dryRun, log);

  const skill = `${runnerOf(manager)} skills add ${existsSync(join(root, 'node_modules', 'deictic')) ? './node_modules/deictic' : 'gkurt/deictic'}`;
  const add =
    options.skill ?? (options.ask === undefined ? false : await options.ask('deictic: add the skill, so your agent works the tasks?'));
  if (!add || dryRun) {
    log(`deictic: to have your agent work the tasks, add the skill: ${skill}`);
  } else {
    log(`deictic: ${skill}`);
    if (!run(skill, root)) log(`deictic: adding the skill failed: run ${skill} yourself`);
  }

  log(`deictic: screenshots render in Playwright's Chromium (${runnerOf(manager)} playwright install chromium), else Chrome or Edge`);
  log('deictic: start your dev server and Alt-click an element');
}

/** Adds deictic to the bundler's config, or says what to add where it can't. */
function configure(root: string, bundler: Bundler | undefined, dryRun: boolean, log: (line: string) => void): void {
  if (bundler === undefined) {
    log('deictic: no bundler it knows in package.json (Vite, Next.js, Astro, webpack, Rspack, Bun): see API.md#bundlers to add it');
    return;
  }
  if (bundler === 'bun') {
    configureBun(root, dryRun, log);
    return;
  }
  const setup = SETUPS[bundler];
  const file = setup.files.map((f) => join(root, f)).find((f) => existsSync(f));
  const imports = `import { recommended } from 'deictic/recommended';\nimport { ${setup.name} } from '${setup.from}';`;
  if (file === undefined) {
    log(`deictic: no ${setup.files[0]} here: add deictic to your ${bundler} config:\n\n${imports}\n${setup.snippet}\n`);
    return;
  }
  const name = relative(root, file).replaceAll('\\', '/');
  const code = readFileSync(file, 'utf8');
  if (/['"]deictic\//.test(code)) {
    log(`deictic: ${name} has it already`);
    return;
  }
  const added = addToConfig(bundler, file, code);
  if (added === undefined) {
    log(`deictic: couldn't tell where it goes in ${name}: add it yourself:\n\n${imports}\n${setup.snippet}\n`);
    return;
  }
  if (!dryRun) writeFileSync(file, added);
  log(`deictic: ${dryRun ? 'would add' : 'added'} it to ${name}`);
}

/** Bun's three steps: the plugin's module, bunfig.toml, and its routes in the server. Each says what to add where it can't. */
function configureBun(root: string, dryRun: boolean, log: (line: string) => void): void {
  const write = (file: string, text: string) => !dryRun && writeFileSync(file, text);
  const did = dryRun ? 'would add' : 'added';
  const plugin = join(root, MODULE);
  if (!existsSync(plugin)) {
    write(plugin, PLUGIN);
    log(`deictic: ${dryRun ? 'would write' : 'wrote'} ${MODULE}`);
  } else if (!readFileSync(plugin, 'utf8').includes('deictic/bun')) {
    log(`deictic: ${MODULE} is a module of yours: add deictic by hand, as API.md#bundlers says for Bun`);
    return;
  }

  const bunfig = join(root, 'bunfig.toml');
  const before = existsSync(bunfig) ? readFileSync(bunfig, 'utf8') : undefined;
  const after = addToBunfig(before);
  if (after === undefined) {
    log(`deictic: couldn't tell where it goes in bunfig.toml: add it yourself:\n\n${BY_HAND.bunfig}\n`);
  } else if (after === before) {
    log('deictic: bunfig.toml has it already');
  } else {
    write(bunfig, after);
    log(`deictic: ${did} it to bunfig.toml`);
  }

  const server = serverOf(root)!;
  const name = relative(root, server).replaceAll('\\', '/');
  const code = readFileSync(server, 'utf8');
  if (code.includes(MODULE.replace(/\.ts$/, ''))) {
    log(`deictic: ${name} has its routes already`);
    return;
  }
  const added = addToServer(server, code, root);
  if (added === undefined) {
    log(`deictic: couldn't tell where its routes go in ${name}: add them yourself:\n\n${BY_HAND.server}\n`);
    return;
  }
  write(server, added);
  log(`deictic: ${did} its routes to ${name}`);
}

/** Asks a yes-or-no question on the terminal, yes by default. */
async function ask(question: string): Promise<boolean> {
  const lines = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return !/^n/i.test((await lines.question(`${question} (Y/n) `)).trim());
  } finally {
    lines.close();
  }
}

export async function run(values: { dryRun?: boolean; install: boolean; skill?: boolean }): Promise<void> {
  try {
    await init({
      cwd: process.cwd(),
      install: values.install,
      skill: values.skill,
      dryRun: values.dryRun,
      ask: process.stdin.isTTY && process.stdout.isTTY ? ask : undefined,
    });
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}
