import { describe, expect, it } from 'vitest';
import { ModuleEntry } from '#site/catalog';
import { depEntries } from './deps';

const entry = (over: Record<string, unknown>) =>
  ModuleEntry.parse({ id: 'tv.kroma.x', name: 'X', version: '1.0.0', ...over });

describe('depEntries', () => {
  it('reads the map a module declares', () => {
    const map = { 'tv.kroma.torrents': '^1.2.0', 'tv.kroma.vpn': '*' };
    expect(depEntries(entry({ dependencies: map }))).toEqual([
      { id: 'tv.kroma.torrents', range: '^1.2.0' },
      { id: 'tv.kroma.vpn', range: '*' },
    ]);
  });

  it('is empty when a module declares nothing', () => {
    for (const deps of [undefined, null, {}]) {
      expect(depEntries(entry({ dependencies: deps }))).toEqual([]);
    }
  });
});
