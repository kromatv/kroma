import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cargo, targetDir } from '../cargo';
import { findProjects } from '../project';

/** `kroma cargo <subcommand> [args]`: one cargo subcommand in every module's
 *  server crate, and in `modules/lib` when there is one. They are separate
 *  workspaces, so `--workspace` from anywhere reaches none of them. */
export async function cargoCommand(args: readonly string[], cwd = process.cwd()): Promise<number> {
  if (args.length === 0) throw new Error('usage: kroma cargo <cargo-subcommand> [args...]');
  const projects = findProjects([], cwd);
  const dir = targetDir(cwd, projects);
  const workspaces: [string, string][] = projects.flatMap((p) =>
    p.server ? [[p.manifest.id, p.server.dir] as [string, string]] : [],
  );
  const lib = join(cwd, 'modules', 'lib');
  if (existsSync(join(lib, 'Cargo.toml'))) workspaces.push(['lib', lib]);

  const failed: string[] = [];
  for (const [id, crateDir] of workspaces) {
    console.log(`\n=== ${id}: cargo ${args.join(' ')}`);
    if ((await cargo(crateDir, args, dir)) !== 0) failed.push(id);
  }
  if (failed.length > 0) {
    console.error(`\ncargo ${args[0]} failed in ${failed.length} module(s): ${failed.join(', ')}`);
    return 1;
  }
  console.log(`\ncargo ${args[0]}: every module passed`);
  return 0;
}
