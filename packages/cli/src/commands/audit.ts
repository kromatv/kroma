import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildComponent, targetDir } from '../cargo';
import { exec } from '../exec';
import { findProjects, type Project } from '../project';
import { CLI_ROOT, repoRoot } from '../scaffold/plan';
import { style } from '../style';

export interface AuditOptions {
  dirs: readonly string[];
  /** One JSON document per module instead of the report a person reads. */
  json?: boolean;
  cwd?: string;
}

/** Where the crate that runs an audit is, and where cargo builds it. */
export interface AuditHost {
  manifest: string;
  /** `null` inside the repository, where the server workspace's own target is used. */
  targetDir: string | null;
}

/**
 * The host an audit runs a module on: the repository's own crate, else the one
 * the SDK carries beside this CLI, built into the module's own target directory
 * so it survives a reinstall of `node_modules`.
 */
export function auditHost(cwd: string, moduleTarget: string): AuditHost {
  const repo = repoRoot(cwd);
  const crate = repo
    ? join(repo, 'server', 'crates', 'kroma-module-audit')
    : join(CLI_ROOT, 'rust', 'kroma-module-audit');
  const manifest = join(crate, 'Cargo.toml');
  if (!existsSync(manifest)) {
    throw new Error(`kroma audit: no audit host at ${crate}; reinstall @kromatv/sdk`);
  }
  return { manifest, targetDir: repo ? null : join(moduleTarget, 'audit-host') };
}

async function passes(
  project: Project,
  dir: string,
  host: AuditHost,
  options: AuditOptions,
  cwd: string,
): Promise<boolean> {
  const component = await buildComponent(project, dir, 'dev');
  if (!component) {
    if (!options.json) {
      console.log(`${style.bold(project.manifest.id)}: no component, nothing to audit`);
    }
    return true;
  }
  const args = ['run', '--quiet', '--manifest-path', host.manifest, '--bin', 'kroma-audit', '--'];
  args.push(project.dir, component);
  if (options.json) {
    args.push('--json');
  } else {
    console.log('');
  }
  const env = host.targetDir ? { ...process.env, CARGO_TARGET_DIR: host.targetDir } : process.env;
  const ran = await exec('cargo', args, { cwd, env });
  return ran.exitCode === 0;
}

/**
 * `kroma audit`: builds each module's component, starts it alone behind a
 * network that records every connection and lets none out, drives it, and prints
 * what it attempted beside what its manifest declares. Exits 1 when any module
 * attempted something it does not declare, or could not be audited.
 */
export async function auditCommand(options: AuditOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const projects = findProjects(options.dirs, cwd);
  const dir = targetDir(cwd, projects);
  const host = auditHost(cwd, dir);

  const failed: string[] = [];
  for (const project of projects) {
    if (!(await passes(project, dir, host, options, cwd))) {
      failed.push(project.manifest.id);
    }
  }
  if (failed.length > 0 && !options.json) {
    console.log(`\n${failed.length} module(s) did not pass: ${failed.join(', ')}`);
  }
  return failed.length > 0 ? 1 : 0;
}
