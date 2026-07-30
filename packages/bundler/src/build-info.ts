import { collectBuildInfo } from '@kroma/build-info';
import type { Plugin } from 'vite';

/**
 * Build metadata as the browser sees it, served as `virtual:build-info`.
 *
 * Collecting it is `@kroma/build-info`'s job — the same one the TV shells and
 * the mobile app config use, so every client answers "which build is this?" the
 * same way. The only difference here is that git's absent fields become
 * `'unknown'` rather than `null`: this ends up on a settings screen, and a build
 * from a source tarball still has to show something.
 */
export interface BuildInfo {
  version: string;
  commit: string;
  commitFull: string;
  branch: string;
  dirty: boolean;
  buildDate: string;
  repository: string | null;
}

/**
 * Serves `virtual:build-info` — a module with no on-disk file, so a component
 * can `import buildInfo from 'virtual:build-info'` and nothing but the resolved
 * constants ships.
 *
 * `projectRoot` is the client being built: it is where the package version is
 * read and where git runs, so the answer does not depend on the directory the
 * build happened to be launched from.
 */
export function buildInfoPlugin({ projectRoot }: { projectRoot: string }): Plugin {
  const virtualId = 'virtual:build-info';
  const resolvedId = `\0${virtualId}`;
  const collected = collectBuildInfo(projectRoot);
  const info: BuildInfo = {
    ...collected,
    commit: collected.commit ?? 'unknown',
    commitFull: collected.commitFull ?? 'unknown',
    branch: collected.branch ?? 'unknown',
  };
  const json = JSON.stringify(info);
  // Default export plus named exports, so both import styles work.
  const names = 'version, commit, commitFull, branch, dirty, buildDate, repository';
  const code = `export default ${json};\nexport const { ${names} } = ${json};\n`;
  return {
    name: 'kroma-build-info',
    resolveId: (source) => (source === virtualId ? resolvedId : null),
    load: (id) => (id === resolvedId ? code : null),
  };
}
