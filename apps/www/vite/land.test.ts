import type { Feature, MultiPolygon } from 'geojson';
import type { Plugin } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadLand = vi.hoisted(() => vi.fn<(root: string) => Promise<Feature<MultiPolygon>>>());

vi.mock('./land-atlas.ts', () => ({ loadLand }));

import { landPlugin } from './land.ts';

const RESOLVED_ID = '\0virtual:kroma-land';

const SQUARE: Feature<MultiPolygon> = {
  type: 'Feature',
  properties: null,
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [-10, -10],
          [10, -10],
          [10, 10],
          [-10, 10],
          [-10, -10],
        ],
      ],
    ],
  },
};

function resolve(plugin: Plugin, id: string): string | null {
  if (typeof plugin.resolveId !== 'function') throw new Error('the plugin lost its resolveId');
  const resolved = plugin.resolveId.call({} as never, id, undefined, { isEntry: false });
  return typeof resolved === 'string' ? resolved : null;
}

async function load(plugin: Plugin, id: string): Promise<string | null> {
  if (typeof plugin.load !== 'function') throw new Error('the plugin lost its load');
  const loaded = await plugin.load.call({} as never, id, undefined);
  return typeof loaded === 'string' ? loaded : null;
}

function settle(plugin: Plugin, root: string): void {
  if (typeof plugin.configResolved !== 'function') {
    throw new Error('the plugin lost its configResolved');
  }
  plugin.configResolved.call({} as never, { root } as never);
}

beforeEach(() => {
  loadLand.mockReset();
  loadLand.mockResolvedValue(SQUARE);
});

describe('landPlugin', () => {
  it('answers to its own virtual id and to nothing else', () => {
    const plugin = landPlugin();

    expect(resolve(plugin, 'virtual:kroma-land')).toBe(RESOLVED_ID);
    expect(resolve(plugin, 'virtual:something-else')).toBe(null);
  });

  it('loads nothing for a module it did not resolve', async () => {
    const plugin = landPlugin();

    expect(await load(plugin, './land.ts')).toBe(null);
  });

  it('compiles the dots in as a module the bundle can import', async () => {
    const plugin = landPlugin({ rows: 8 });

    const code = await load(plugin, RESOLVED_ID);

    expect(code).toMatch(/^export const points = \[[\d.,\s-]*\];$/);
  });

  it('reads the atlas once however many times the module is asked for', async () => {
    const plugin = landPlugin({ rows: 8 });

    const first = await load(plugin, RESOLVED_ID);
    const second = await load(plugin, RESOLVED_ID);

    expect(second).toBe(first);
    expect(loadLand).toHaveBeenCalledTimes(1);
  });

  it('reads the atlas out of the root vite resolved, not the working directory', async () => {
    const plugin = landPlugin({ rows: 8 });

    settle(plugin, '/repo/apps/www');
    await load(plugin, RESOLVED_ID);

    expect(loadLand).toHaveBeenCalledWith('/repo/apps/www');
  });

  it('falls back to the working directory when no config was resolved', async () => {
    const plugin = landPlugin({ rows: 8 });

    await load(plugin, RESOLVED_ID);

    expect(loadLand).toHaveBeenCalledWith(process.cwd());
  });
});
