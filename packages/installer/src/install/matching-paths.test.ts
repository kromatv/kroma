import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { matchesWildcard, matchingPaths } from './matching-paths';

const root = mkdtempSync(join(tmpdir(), 'kroma-paths-'));

function file(path: string): string {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), '');
  return join(root, path);
}

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('matchesWildcard', () => {
  it('takes a name the pattern spells letter for letter', () => {
    expect(matchesWildcard('config.xml', 'config.xml')).toBe(true);
    expect(matchesWildcard('config.xml.bak', 'config.xml')).toBe(false);
  });

  it('lets a star stand for any run of characters, an empty one included', () => {
    expect(matchesWildcard('KROMA-tizen-0.1.38.wgt', 'KROMA-tizen-*.wgt')).toBe(true);
    expect(matchesWildcard('KROMA-tizen-.wgt', 'KROMA-tizen-*.wgt')).toBe(true);
  });

  it('refuses a name that only shares the start or only the end', () => {
    expect(matchesWildcard('KROMA-tizen8-0.1.38.wgt', 'KROMA-tizen-*.wgt')).toBe(false);
    expect(matchesWildcard('KROMA-tizen-0.1.38.ipk', 'KROMA-tizen-*.wgt')).toBe(false);
  });

  it('never lets the start and the end share a character', () => {
    expect(matchesWildcard('ab', 'ab*b')).toBe(false);
  });

  it('finds every fixed part in order between two stars', () => {
    expect(matchesWildcard('tv.kroma.webos_0.1.38_all.ipk', 'tv.*webos_*_all.ipk')).toBe(true);
    expect(matchesWildcard('tv.kroma.webos_all.ipk', 'tv.*webos_*_x_*all.ipk')).toBe(false);
    expect(matchesWildcard('a-x-b', 'a*x*x*b')).toBe(false);
  });
});

describe('matchingPaths', () => {
  it('lists what one folder holds under a starred name', () => {
    const wgt = file('flat/out/KROMA-tizen-0.1.38.wgt');
    file('flat/out/notes.txt');

    expect(matchingPaths(root, 'flat/out/*.wgt')).toEqual([wgt]);
  });

  it('follows a starred folder name', () => {
    const app = file('starred/Release-appletvos/KROMA.app');
    file('starred/Release-iphoneos/KROMA.app');

    expect(matchingPaths(root, 'starred/*-appletvos/*.app')).toEqual([app]);
  });

  it('reaches any depth under a double star, the folder itself included', () => {
    const shallow = file('deep/build/Products/KROMA.app');
    const nested = file('deep/build/a/b/Products/KROMA.app');

    expect(matchingPaths(root, 'deep/build/**/Products/*.app').sort()).toEqual(
      [nested, shallow].sort(),
    );
  });

  it('answers a folder as readily as a file', () => {
    mkdirSync(join(root, 'bundle/KROMA.app'), { recursive: true });

    expect(matchingPaths(root, 'bundle/*.app')).toEqual([join(root, 'bundle/KROMA.app')]);
  });

  it('never looks inside a file for more path', () => {
    file('blocked/out');

    expect(matchingPaths(root, 'blocked/out/*.wgt')).toEqual([]);
  });

  it('answers nothing for a folder that is not there', () => {
    expect(matchingPaths(root, 'missing/out/*.wgt')).toEqual([]);
    expect(matchingPaths(join(root, 'nowhere'), '*.wgt')).toEqual([]);
  });

  it('names nothing with a double star and no name after it', () => {
    file('open/a/b.txt');

    expect(matchingPaths(root, 'open/**')).toEqual([]);
  });
});
