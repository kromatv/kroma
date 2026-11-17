import { describe, expect, it } from 'vitest';
import { ModuleEntry } from '#site/catalog';
import { depEntries, engineLabel } from './deps';

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

describe('engineLabel', () => {
  it.each([
    ['server', '>=0.1.40', 'KROMA >=0.1.40'],
    ['host', '0.2.0', 'module interface 0.2.0'],
    ['core', '19', 'core schema 19'],
    ['ffmpeg', '>=6', 'ffmpeg >=6'],
  ])('reads %s %s as %j', (engine, range, label) => {
    expect(engineLabel(engine, range)).toBe(label);
  });
});
