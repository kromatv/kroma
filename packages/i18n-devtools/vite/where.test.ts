import type { ViteDevServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { forgetMaps, sourceOf } from './where.ts';

// One segment: generated line 1 column 0 comes from source line 3 column 0.
const MAP = { version: 3 as const, sources: ['who.tsx'], names: [], mappings: 'AAEA' };

function serving(map: unknown, transform = vi.fn()): ViteDevServer {
  transform.mockResolvedValue(map === undefined ? null : { code: '', map });
  return { environments: { client: { transformRequest: transform } } } as unknown as ViteDevServer;
}

describe('where a served position was written', () => {
  it('reads the line back through the module map', async () => {
    forgetMaps();

    const at = await sourceOf({ url: '/src/who.tsx', line: 1, column: 1 }, serving(MAP));

    expect(at).toEqual({ line: 3 });
  });

  it('says nothing for a module the server will not transform', async () => {
    forgetMaps();

    expect(await sourceOf({ url: '/none', line: 1, column: 1 }, serving(undefined))).toBeNull();
  });

  it('says nothing for a module transformed without a map', async () => {
    forgetMaps();

    expect(await sourceOf({ url: '/plain', line: 1, column: 1 }, serving(null))).toBeNull();
  });

  it('says nothing for a map that maps nothing', async () => {
    forgetMaps();
    const empty = { version: 3 as const, sources: [], names: [], mappings: '' };

    expect(await sourceOf({ url: '/empty', line: 1, column: 1 }, serving(empty))).toBeNull();
  });

  it('says nothing for a position the map does not reach', async () => {
    forgetMaps();

    expect(await sourceOf({ url: '/src/who.tsx', line: 99, column: 1 }, serving(MAP))).toBeNull();
  });

  it('asks the server for a module once, and again once it has changed', async () => {
    forgetMaps();
    const transform = vi.fn();
    const server = serving(MAP, transform);

    await sourceOf({ url: '/src/who.tsx', line: 1, column: 1 }, server);
    await sourceOf({ url: '/src/who.tsx', line: 1, column: 1 }, server);

    expect(transform).toHaveBeenCalledTimes(1);

    forgetMaps();
    await sourceOf({ url: '/src/who.tsx', line: 1, column: 1 }, server);

    expect(transform).toHaveBeenCalledTimes(2);
  });

  it('says nothing when the server refuses the module outright', async () => {
    forgetMaps();
    const transform = vi.fn().mockRejectedValue(new Error('gone'));
    const server = { environments: { client: { transformRequest: transform } } };

    const at = await sourceOf({ url: '/boom', line: 1, column: 1 }, server as never);

    expect(at).toBeNull();
  });
});
