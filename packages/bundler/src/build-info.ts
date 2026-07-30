import { collectBuildInfo } from '@kroma/build-info';
import type { Plugin } from 'vite';

/**
 * Build metadata as the browser sees it. Unlike `@kroma/build-info`, git's
 * absent fields are `'unknown'` rather than `null`, because this is displayed.
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
 * Serves `virtual:build-info`, a module with no on-disk file. `projectRoot` is
 * the client being built: the version is read and git runs there, so the answer
 * does not depend on the directory the build was launched from.
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
  const names = 'version, commit, commitFull, branch, dirty, buildDate, repository';
  const code = `export default ${json};\nexport const { ${names} } = ${json};\n`;
  return {
    name: 'kroma-build-info',
    resolveId: (source) => (source === virtualId ? resolvedId : null),
    load: (id) => (id === resolvedId ? code : null),
  };
}
