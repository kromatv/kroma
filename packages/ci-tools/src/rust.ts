import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { summary } from './actions';
import { root } from './root';
import { featured, on, SERVER, type Workspace, workspaces } from './rust-workspaces';

const env = (ws: Workspace) => ({
  ...process.env,
  CARGO_PROFILE_DEV_DEBUG: '0',
  ...(ws.targetDir ? { CARGO_TARGET_DIR: ws.targetDir } : {}),
});

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

async function clippy(): Promise<void> {
  await each('clippy', (ws) => ['clippy', ...scope(ws), '--all-targets']);
  await each(
    'clippy with features',
    (ws) => ['clippy', ...scope(ws), '--all-targets', ...on(ws)],
    featured(),
  );
}

async function test(): Promise<void> {
  const report = join(root, 'server/lcov.info');
  rmSync(report, { force: true });
  const list = workspaces();
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
    featured(),
  );
  const measured = [...list.map(partial), ...featured().map(featuredPartial)].filter((at) =>
    existsSync(at),
  );
  writeFileSync(report, measured.map((at) => readFileSync(at, 'utf8')).join('\n'));
  for (const at of measured) rmSync(at);

  const records = readFileSync(report, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('SF:'));
  summary(`### Rust tests\n\n${measured.length} run(s) measured, lcov: ${records.length} files`);
}

export async function main(argv: string[]): Promise<void> {
  const [verb] = argv;
  if (verb === 'clippy') return clippy();
  if (verb === 'test') return test();
  throw new Error(`usage: bun run ci rust <clippy|test>`);
}
