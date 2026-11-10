import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { type RememberedSet, rememberedSets, rememberSet } from './remembered';

const base = mkdtempSync(join(tmpdir(), 'kroma-remembered-'));
const file = (name: string) => join(base, name, 'televisions.json');

const salon: RememberedSet = {
  host: '192.168.1.31',
  platform: 'tizen',
  name: 'Salon',
  model: 'UE50AU7172',
  package: 'KROMA-tizen-0.1.38.wgt',
  source: 'stable',
  installedAt: '2026-11-10T12:00:00.000Z',
};

const chambre: RememberedSet = {
  ...salon,
  host: '192.168.1.44',
  platform: 'webos',
  name: 'Chambre',
  model: 'OLED55C1',
  package: 'tv.kroma.webos_0.1.38_all.ipk',
};

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('rememberSet', () => {
  it('keeps a set in a file it creates, folder included', async () => {
    const path = file('first');

    await rememberSet(salon, path);

    expect(await rememberedSets(path)).toEqual([salon]);
    expect(readFileSync(path, 'utf8').endsWith('}\n')).toBe(true);
  });

  it('keeps every set, each at its own address', async () => {
    const path = file('two');

    await rememberSet(salon, path);
    await rememberSet(chambre, path);

    expect((await rememberedSets(path)).map((set) => set.host)).toEqual([
      '192.168.1.31',
      '192.168.1.44',
    ]);
  });

  it('keeps the options an update repeats', async () => {
    const path = file('options');
    const signed = { ...salon, options: { profile: 'KROMA' } };

    await rememberSet(signed, path);

    expect(await rememberedSets(path)).toEqual([signed]);
  });

  it('replaces what an address held before', async () => {
    const path = file('again');
    const newer = { ...salon, package: 'KROMA-tizen-0.1.39.wgt' };

    await rememberSet(salon, path);
    await rememberSet(newer, path);

    expect(await rememberedSets(path)).toEqual([newer]);
  });
});

describe('rememberedSets', () => {
  it('answers none before anything was installed', async () => {
    expect(await rememberedSets(file('nothing'))).toEqual([]);
  });

  it('answers none for a file that is not JSON', async () => {
    const path = join(base, 'broken.json');
    writeFileSync(path, '{ televisions: ');

    expect(await rememberedSets(path)).toEqual([]);
  });

  it('answers none for a file that is not a list of sets', async () => {
    const path = join(base, 'foreign.json');
    writeFileSync(path, JSON.stringify({ televisions: [{ host: 42 }] }));

    expect(await rememberedSets(path)).toEqual([]);
  });

  it('answers none for a file far larger than a list of sets', async () => {
    const path = join(base, 'huge.json');
    writeFileSync(path, ' '.repeat(1_000_001));

    expect(await rememberedSets(path)).toEqual([]);
  });
});
