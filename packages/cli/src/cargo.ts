import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import type { Project } from './project';

export type Profile = 'release-kmod' | 'dev';

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
 * The `cargo build` arguments for a sidecar, and where cargo will leave the
 * binary. Bare feature names and no `-p`: a module is its own single-package
 * workspace, so `pkg/feat` would name a dependency.
 */
export function cargoBuild(
  bin: string,
  features: readonly string[],
  target: string | null,
  profile: Profile,
  dir: string,
): CargoBuild {
  const args = ['build', '--bin', bin];
  if (profile === 'release-kmod') args.push('--profile', 'release-kmod');
  if (features.length) args.push('--features', features.join(','));
  if (target) args.push('--target', target);
  const outDir = profile === 'release-kmod' ? 'release-kmod' : 'debug';
  const binPath = target ? join(dir, target, outDir, bin) : join(dir, outDir, bin);
  return { args, binPath };
}

/** Runs one cargo subcommand in a module's server crate. */
export async function cargo(
  cwd: string,
  args: readonly string[],
  dir: string,
  quiet = false,
): Promise<number> {
  const run = $`cargo ${args}`
    .cwd(cwd)
    .env({ ...process.env, CARGO_TARGET_DIR: dir })
    .nothrow();
  const result = quiet ? await run.quiet() : await run;
  return result.exitCode;
}

export interface BuildOptions {
  target: string | null;
  profile: Profile;
  /** The binary was built out of band (CI's cross container); only locate it. */
  skipBuild?: boolean;
}

/** Builds a project's sidecar and returns the binary, or `null` for a library module. */
export async function buildSidecar(
  project: Project,
  dir: string,
  options: BuildOptions,
): Promise<string | null> {
  const server = project.server;
  if (!server?.bin) return null;
  const { args, binPath } = cargoBuild(
    server.bin,
    server.features,
    options.target,
    options.profile,
    dir,
  );
  if (!options.skipBuild) {
    const code = await cargo(server.dir, args, dir);
    if (code !== 0) throw new Error(`${project.manifest.id}: cargo build failed`);
  }
  if (!existsSync(binPath)) {
    throw new Error(
      options.skipBuild
        ? `KMOD_SKIP_BUILD is set but there is no prebuilt binary at ${binPath}`
        : `${project.manifest.id}: cargo built no binary at ${binPath}`,
    );
  }
  return binPath;
}
