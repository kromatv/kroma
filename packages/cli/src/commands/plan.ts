import { relative } from 'node:path';
import { cargoBuild, targetDir } from '../cargo';
import { findProjects } from '../project';

/** `kroma plan`: the `cargo build` lines that produce every sidecar, for CI to
 *  run inside its cross-compile container. Paths are relative to the cwd, so
 *  a container mounting the tree elsewhere runs it unchanged. */
export function planCommand(
  dirs: readonly string[],
  target: string | undefined,
  cwd = process.cwd(),
): number {
  const projects = findProjects(dirs, cwd);
  const dir = targetDir(cwd, projects);
  const triple = target?.trim() || process.env.KMOD_TARGET?.trim() || null;
  const lines = [`export CARGO_TARGET_DIR="$PWD/${relative(cwd, dir)}"`];
  for (const project of projects) {
    const server = project.server;
    if (!server?.bin) continue;
    const { args } = cargoBuild(server.bin, server.features, triple, 'release-kmod', dir);
    const manifest = relative(cwd, `${server.dir}/Cargo.toml`);
    lines.push(`cargo ${args.join(' ')} --manifest-path ${manifest}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}
