import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { summary } from './actions';
import { root } from './root';

interface Workspace {
  id: string;
  dir: string;
  targetDir: string | undefined;
}

const KMOD_TARGET_DIR = join(root, 'target/kmod');

const SERVER: Workspace = { id: 'server', dir: join(root, 'server'), targetDir: undefined };

function workspaces(): Workspace[] {
  const modules = join(root, 'modules');
  const out = [SERVER];
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = entry.name === 'lib' ? join(modules, 'lib') : join(modules, entry.name, 'server');
    if (existsSync(join(dir, 'Cargo.toml'))) {
      out.push({ id: entry.name, dir, targetDir: KMOD_TARGET_DIR });
    }
  }
  return out;
}

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

const clippy = () => each('clippy', (ws) => ['clippy', ...scope(ws), '--all-targets']);

async function test(): Promise<void> {
  const report = join(root, 'server/lcov.info');
  rmSync(report, { force: true });
  const list = workspaces();
  const partial = (ws: Workspace) => join(ws.dir, 'lcov.part.info');
  await each(
    'test',
    (ws) => ['llvm-cov', ...scope(ws), '--lcov', '--output-path', partial(ws)],
    list,
  );
  const parts = list.filter((ws) => existsSync(partial(ws)));
  writeFileSync(report, parts.map((ws) => readFileSync(partial(ws), 'utf8')).join('\n'));
  for (const ws of parts) rmSync(partial(ws));

  const records = readFileSync(report, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('SF:'));
  summary(`### Rust tests\n\n${parts.length} workspace(s) measured, lcov: ${records.length} files`);
}

export async function main(argv: string[]): Promise<void> {
  const [verb] = argv;
  if (verb === 'clippy') return clippy();
  if (verb === 'test') return test();
  throw new Error(`usage: bun run ci rust <clippy|test>`);
}
