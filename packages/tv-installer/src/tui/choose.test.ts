import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Source } from '../install/artifact';
import type { ModuleOptions } from '../modules/module';
import type { Television } from '../television';
import { television } from '../television.fixture';
import { askModules, chooseKinds, chooseVersion } from './choose';

interface Ask {
  message: string;
  options: { value: string; label: string; hint?: string }[];
  initialValue?: string;
}

interface FakeModule {
  id: string;
  label: string;
  brands: string;
  sources: () => Source[];
  prompt?: (sets: readonly Television[]) => Promise<Map<string, ModuleOptions> | null>;
}

const fake = vi.hoisted(() => ({
  CANCELLED: Symbol('cancelled'),
  select: vi.fn<(ask: Ask) => Promise<unknown>>(),
  askLg: vi.fn<(sets: readonly Television[]) => Promise<Map<string, ModuleOptions> | null>>(),
  modules: [] as FakeModule[],
}));

vi.mock('../modules/registry', () => ({ modules: () => fake.modules }));
vi.mock('@clack/prompts', () => ({
  isCancel: (value: unknown) => value === fake.CANCELLED,
  select: fake.select,
}));

const samsung = (sources: Source[]): FakeModule => ({
  id: 'tizen',
  label: 'Samsung',
  brands: 'Samsung',
  sources: () => sources,
});
const lg = (sources: Source[]): FakeModule => ({
  id: 'webos',
  label: 'LG',
  brands: 'LG',
  sources: () => sources,
  prompt: fake.askLg,
});
const android = (sources: Source[]): FakeModule => ({
  id: 'androidtv',
  label: 'Android TV',
  brands: 'Google TV, Sony',
  sources: () => sources,
});

const salon = television();
const cuisine = television({ host: '192.168.1.12', name: 'Cuisine', platform: 'webos' });
const bureau = television({ host: '192.168.1.13', name: 'Bureau', platform: 'webos' });

const asked = () => fake.select.mock.calls[0]?.[0];
const offered = () => asked()?.options.map((option) => option.value);

beforeEach(() => {
  vi.clearAllMocks();
  fake.modules = [samsung(['stable', 'canary']), lg(['stable', 'canary']), android(['stable'])];
});

describe('chooseVersion', () => {
  it('offers stable first, and starts on it', async () => {
    fake.select.mockResolvedValue('canary');

    await expect(chooseVersion()).resolves.toBe('canary');
    expect(asked()).toMatchObject({ message: 'Which version of KROMA?', initialValue: 'stable' });
    expect(offered()).toEqual(['stable', 'canary']);
  });

  it('offers what any kind of TV can take, in a fixed order', async () => {
    fake.modules = [samsung(['local', 'stable', 'canary', 'build']), android(['stable'])];
    fake.select.mockResolvedValue('build');

    await chooseVersion();

    expect(offered()).toEqual(['stable', 'canary', 'local', 'build']);
  });

  it('labels each version by what it is', async () => {
    fake.select.mockResolvedValue('stable');

    await chooseVersion();

    expect(asked()?.options[0]).toEqual({
      value: 'stable',
      label: 'Stable',
      hint: 'the latest release, recommended',
    });
  });

  it('answers null when the choice is quit', async () => {
    fake.select.mockResolvedValue(fake.CANCELLED);

    await expect(chooseVersion()).resolves.toBeNull();
  });
});

describe('chooseKinds', () => {
  it('answers the one kind of TV that was picked', async () => {
    fake.select.mockResolvedValue('webos');

    await expect(chooseKinds('stable')).resolves.toEqual(['webos']);
    expect(asked()?.message).toBe('Which kind of TV?');
  });

  it('answers every kind that takes the version when every kind is picked', async () => {
    fake.select.mockResolvedValue('every');

    await expect(chooseKinds('canary')).resolves.toEqual(['tizen', 'webos']);
    expect(offered()).toEqual(['tizen', 'webos', 'every']);
  });

  it('offers every kind when no version was named', async () => {
    fake.select.mockResolvedValue('every');

    await expect(chooseKinds()).resolves.toEqual(['tizen', 'webos', 'androidtv']);
  });

  it('gives the brands as a hint only where they say more than the name', async () => {
    fake.select.mockResolvedValue('tizen');

    await chooseKinds('stable');

    expect(asked()?.options.slice(0, 3)).toEqual([
      { value: 'tizen', label: 'Samsung', hint: undefined },
      { value: 'webos', label: 'LG', hint: undefined },
      { value: 'androidtv', label: 'Android TV', hint: 'Google TV, Sony' },
    ]);
  });

  it('asks nothing when a single kind takes the version', async () => {
    fake.modules = [samsung(['stable', 'build']), lg(['stable'])];

    await expect(chooseKinds('build')).resolves.toEqual(['tizen']);
    expect(fake.select).not.toHaveBeenCalled();
  });

  it('answers null when the choice is quit', async () => {
    fake.select.mockResolvedValue(fake.CANCELLED);

    await expect(chooseKinds('stable')).resolves.toBeNull();
  });
});

describe('askModules', () => {
  it('asks a platform about its own sets and no others', async () => {
    fake.askLg.mockResolvedValue(new Map());

    await askModules([salon, cuisine, bureau]);

    expect(fake.askLg).toHaveBeenCalledTimes(1);
    expect(fake.askLg).toHaveBeenCalledWith([cuisine, bureau]);
  });

  it('asks nothing about a platform no chosen set runs', async () => {
    await expect(askModules([salon])).resolves.toEqual(new Map());
    expect(fake.askLg).not.toHaveBeenCalled();
  });

  it('keeps every answer under the host it was asked about', async () => {
    fake.askLg.mockResolvedValue(new Map([[cuisine.host, { passphrase: 'ABCDEF' }]]));

    await expect(askModules([salon, cuisine])).resolves.toEqual(
      new Map([[cuisine.host, { passphrase: 'ABCDEF' }]]),
    );
  });

  it('answers null as soon as one platform question is quit', async () => {
    fake.askLg.mockResolvedValue(null);

    await expect(askModules([cuisine])).resolves.toBeNull();
  });
});
