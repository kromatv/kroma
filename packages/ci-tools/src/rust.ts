import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { summary } from './actions';
import { root } from './root';
import { parseArgs } from 'node:util';
import { type ComponentRun, componentTable } from './rust-components';
import {
  cargoEnv as env,
  featured,
  on,
  SERVER,
  type Workspace,
  workspaces,
} from './rust-workspaces';

async function each(
  verb: string,
  args: (ws: Workspace) => string[],
  list = workspaces(),
): Promise<void> {
  const failed: string[] = [];
  for (const ws of list) {
    console.log(`\n=== ${ws.id}: cargo ${args(ws).join(' ')}`);
    const result = await $`cargo ${args(ws)}`.cwd(ws.dir).env(env(ws)).nothrow();
    if (result.exitCode !== 0) failed.push(ws.id);
  }
  if (failed.length > 0) throw new Error(`${verb} failed in: ${failed.join(', ')}`);
  console.log(`\n${verb}: every workspace passed`);
}

const scope = (ws: Workspace) => (ws === SERVER ? ['--workspace'] : []);

const COMPONENT = 'wasm32-wasip2';
const RUNNER_CRATE = join(root, 'server/crates/kroma-wasm-test-runner');
const RUNNER_TARGET_DIR = join(root, 'target/wasm-test-runner');

const DENIED = ['-D', 'clippy::disallowed_methods', '-D', 'clippy::disallowed_types'];

async function clippy(list: Workspace[]): Promise<void> {
  await each('clippy', (ws) => ['clippy', ...scope(ws), '--all-targets', '--', ...DENIED], list);
  await each(
    'clippy with features',
    (ws) => ['clippy', ...scope(ws), '--all-targets', ...on(ws), '--', ...DENIED],
    withFeatures(list),
  );
}

const withFeatures = (list: Workspace[]) =>
  featured().filter((ws) => list.some((chosen) => chosen.id === ws.id));

function chosen(only: string | undefined): Workspace[] {
  const all = workspaces();
  if (only === undefined) return all;
  const ids = only
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const unknown = ids.filter((id) => !all.some((ws) => ws.id === id));
  if (unknown.length > 0) throw new Error(`unknown workspace(s): ${unknown.join(', ')}`);
  return all.filter((ws) => ids.includes(ws.id));
}

async function test(list: Workspace[]): Promise<void> {
  const report = join(root, 'server/lcov.info');
  rmSync(report, { force: true });
  const partial = (ws: Workspace) => join(ws.dir, 'lcov.part.info');
  const featuredPartial = (ws: Workspace) => join(ws.dir, 'lcov.features.info');
  await each(
    'test',
    (ws) => ['llvm-cov', ...scope(ws), '--lcov', '--output-path', partial(ws)],
    list,
  );
  await each(
    'test with features',
    (ws) => ['llvm-cov', ...scope(ws), ...on(ws), '--lcov', '--output-path', featuredPartial(ws)],
    withFeatures(list),
  );
  const measured = [...list.map(partial), ...withFeatures(list).map(featuredPartial)].filter((at) =>
    existsSync(at),
  );
  writeFileSync(report, measured.map((at) => readFileSync(at, 'utf8')).join('\n'));
  for (const at of measured) rmSync(at);

  const records = readFileSync(report, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('SF:'));
  summary(`### Rust tests\n\n${measured.length} run(s) measured, lcov: ${records.length} files`);
}

async function buildRunner(): Promise<void> {
  console.log('\n=== kroma-wasm-test-runner');
  const built = await $`cargo build --profile wasm-test-runner --target-dir ${RUNNER_TARGET_DIR}`
    .cwd(RUNNER_CRATE)
    .nothrow();
  if (built.exitCode !== 0) throw new Error('the wasm test runner did not build');
}

async function componentTests(list: Workspace[]): Promise<void> {
  const modules = list.filter((ws) => ws.id !== SERVER.id);
  if (modules.length === 0) {
    console.log('no module workspace to run as a component');
    return;
  }
  await buildRunner();
  const runs: ComponentRun[] = [];
  for (const ws of modules) {
    const args = ['test', '--target', COMPONENT, '--no-fail-fast', ...on(ws)];
    console.log(`\n=== ${ws.id}: cargo ${args.join(' ')}`);
    const started = performance.now();
    const result = await $`cargo ${args}`.cwd(ws.dir).env(env(ws)).nothrow();
    runs.push({
      id: ws.id,
      seconds: (performance.now() - started) / 1000,
      passed: result.exitCode === 0,
    });
  }
  summary(`### Module tests as components\n\n${componentTable(runs)}`);
  const failed = runs.filter((run) => !run.passed).map((run) => run.id);
  if (failed.length > 0) throw new Error(`the component run failed in: ${failed.join(', ')}`);
}

export async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { only: { type: 'string' } },
  });
  const [verb] = positionals;
  const list = chosen(values.only);
  if (verb === 'clippy') return clippy(list);
  if (verb === 'test') return test(list);
  if (verb === 'wasm-test') return componentTests(list);
  throw new Error(`usage: bun run ci rust <clippy|test|wasm-test> [--only id,id]`);
}
