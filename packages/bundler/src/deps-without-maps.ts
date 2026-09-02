import { sep } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Serve pre-bundled dependencies without their source map in dev.
 *
 * Vite writes a hidden map beside every pre-bundled dependency and inlines it
 * into the module it serves, which triples what a cold load downloads: zod
 * alone goes from 460 KB to 1.6 MB. A map inside a dependency is rarely what
 * anyone steps through, and the option to skip it is gone in Vite 8, so this
 * hands the pipeline an empty map for those files instead. Dev only: a build
 * decides its own maps.
 */
export function depsWithoutMaps(): Plugin {
  let deps = '';
  return {
    name: 'kroma:deps-without-maps',
    apply: 'serve',
    enforce: 'post',
    configResolved(config) {
      deps = `${config.cacheDir}${sep}deps${sep}`;
    },
    transform(code, id) {
      if (!id.startsWith(deps)) return undefined;
      return { code, map: { mappings: '' } };
    },
  };
}
