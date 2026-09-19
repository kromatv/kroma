import type { Plugin } from 'vite';
import { loadLand } from './land-atlas.ts';
import { DEFAULT_ROWS, landDots } from './land-dots.ts';

// The dotted globe's land, computed once per build from the atlas in
// node_modules and compiled into the bundle as `virtual:kroma-land`. Nothing is
// committed and nothing is fetched: the lattice is a pure function of the atlas
// and the row count, so the same sources give the same dots.

const VIRTUAL_ID = 'virtual:kroma-land';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

export interface LandOptions {
  rows?: number;
}

/** Serves `virtual:kroma-land`: the globe's land dots, see `landDots`. */
export function landPlugin({ rows = DEFAULT_ROWS }: LandOptions = {}): Plugin {
  let root = process.cwd();
  let points: Promise<number[]> | undefined;

  return {
    name: 'kroma:land',
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      points ??= loadLand(root).then((land) => landDots(land, rows));
      return `export const points = ${JSON.stringify(await points)};`;
    },
  };
}
