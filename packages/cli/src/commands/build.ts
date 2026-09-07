import { join } from 'node:path';
import { packBundle } from '../bundle/pack';
import { buildSidecar, type Profile, targetDir } from '../cargo';
import { buildFrontend } from '../fe/build';
import { findProjects, type Project } from '../project';
import { style } from '../style';

export interface BuildOptions {
  dirs: readonly string[];
  out?: string | undefined;
  target?: string | undefined;
  profile?: Profile;
  skipBuild?: boolean;
  cwd?: string;
}

/** Where a module's built frontend is staged before it is packed. */
export function feOutDir(project: Project): string {
  return join(project.dir, 'dist', 'fe');
}

function describe(project: Project): string {
  const server = project.server;
  if (!server?.bin) return 'library, no binary';
  const extras = server.features.length ? ` [+${server.features.join(',')}]` : '';
  return `bin ${server.bin}${extras}`;
}

/** `kroma build`: every module's sidecar (one at a time, they share cargo's
 *  lock), then every frontend and bundle at once. */
export async function buildCommand(options: BuildOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const projects = findProjects(options.dirs, cwd);
  const dir = targetDir(cwd, projects);
  const outDir = options.out ?? join(cwd, 'dist', 'modules');
  const target = options.target?.trim() || process.env.KMOD_TARGET?.trim() || null;
  const profile = options.profile ?? 'release-kmod';
  const skipBuild = options.skipBuild ?? process.env.KMOD_SKIP_BUILD === '1';

  const built: { project: Project; binPath: string | null }[] = [];
  for (const project of projects) {
    console.log(`\n${style.bold(project.manifest.id)} (${describe(project)})`);
    built.push({
      project,
      binPath: await buildSidecar(project, dir, { target, profile, skipBuild }),
    });
  }

  const packed = await Promise.all(
    built.map(async ({ project, binPath }) => {
      const fe = feOutDir(project);
      const hasFe = await buildFrontend(project, fe, 'production');
      const result = packBundle({ project, binPath, feDir: hasFe ? fe : null, outDir, target });
      console.log(`  ${result.changed ? 'packed' : 'unchanged'}: ${result.path}`);
      return result;
    }),
  );
  console.log(`\n${packed.length} bundle(s) in ${outDir}`);
  return 0;
}
