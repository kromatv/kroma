import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { exec } from './exec';
import type { Project } from './project';

export type Profile = 'release-kmod' | 'dev';

/** The one target every module is built for, whatever the machine. */
export const COMPONENT_TARGET = 'wasm32-wasip2';

export interface CargoBuild {
  args: string[];
  binPath: string;
}

/**
 * Where every module's cargo output goes. One directory for a set of modules,
 * so the dependency graph they share compiles once; a standalone module keeps
 * cargo's own `server/target`. `KMOD_TARGET_DIR` overrides both.
 */
export function targetDir(cwd: string, projects: readonly Project[]): string {
  const env = process.env.KMOD_TARGET_DIR?.trim();
  if (env) return env;
  const only = projects[0];
  if (projects.length === 1 && only?.dir === cwd) return join(only.dir, 'server/target');
  return join(cwd, 'target/kmod');
}

/**
 * The `cargo build` arguments for a module's component, and where cargo will
 * leave the `.wasm`. Bare feature names and no `-p`: a module is its own
 * single-package workspace, so `pkg/feat` would name a dependency.
 */
export function cargoBuild(
  bin: string,
  features: readonly string[],
  profile: Profile,
  dir: string,
): CargoBuild {
  const args = ['build', '--bin', bin];
  if (profile === 'release-kmod') args.push('--profile', 'release-kmod');
  if (features.length) args.push('--features', features.join(','));
  args.push('--target', COMPONENT_TARGET);
  const outDir = profile === 'release-kmod' ? 'release-kmod' : 'debug';
  return { args, binPath: join(dir, COMPONENT_TARGET, outDir, `${bin}.wasm`) };
}

/** Runs one cargo subcommand in a module's server crate. */
export async function cargo(
  cwd: string,
  args: readonly string[],
  dir: string,
  quiet = false,
): Promise<number> {
  const result = await exec('cargo', args, {
    cwd,
    env: { ...process.env, CARGO_TARGET_DIR: dir },
    quiet,
  });
  return result.exitCode;
}

/** Builds a project's component and returns the `.wasm`, or `null` for a module
 *  with no server crate and for a library module. */
export async function buildComponent(
  project: Project,
  dir: string,
  profile: Profile,
): Promise<string | null> {
  const server = project.server;
  const id = project.manifest.id;
  if (!server) return null;
  if (!server.bin) {
    if (project.manifest.library) return null;
    throw new Error(
      `${id}: server/Cargo.toml declares no [[bin]], so no component is built; a module without one is "library": true`,
    );
  }
  const { args, binPath } = cargoBuild(server.bin, server.features, profile, dir);
  const code = await cargo(server.dir, args, dir);
  if (code !== 0) throw new Error(`${id}: cargo build failed`);
  if (!existsSync(binPath)) throw new Error(`${id}: cargo built no component at ${binPath}`);
  return binPath;
}
