import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Source } from '../install/artifact';
import type { ModuleOptions } from '../modules/module';
import type { Television } from '../television';
import { television } from '../television.fixture';
import { askModules, chooseSource } from './choose';

interface Ask {
  message: string;
  options: { value: Source; label: string; hint: string }[];
  initialValue?: Source;
}

const fake = vi.hoisted(() => {
  const sources: Record<string, Source[]> = {};
  return {
    sources,
    CANCELLED: Symbol('cancelled'),
    select: vi.fn<(ask: Ask) => Promise<unknown>>(),
    askLg: vi.fn<(sets: readonly Television[]) => Promise<Map<string, ModuleOptions> | null>>(),
  };
});

vi.mock('../modules/registry', () => ({
  moduleFor: (platform: string) => ({ sources: () => fake.sources[platform] ?? [] }),
  modules: () => [{ id: 'tizen' }, { id: 'webos', prompt: fake.askLg }],
}));
vi.mock('@clack/prompts', () => ({
  isCancel: (value: unknown) => value === fake.CANCELLED,
  select: fake.select,
}));

const salon = television();
const chambre = television({ host: '192.168.1.11', name: 'Chambre' });
const cuisine = television({ host: '192.168.1.12', name: 'Cuisine', platform: 'webos' });
const bureau = television({ host: '192.168.1.13', name: 'Bureau', platform: 'webos' });

const offered = () => fake.select.mock.calls[0]?.[0].options.map((option) => option.value);

beforeEach(() => {
  vi.clearAllMocks();
  fake.sources = { tizen: ['local', 'stable', 'build'], webos: ['stable', 'canary'] };
});

describe('chooseSource', () => {
  it('offers only what every chosen platform can serve', async () => {
    fake.select.mockResolvedValue('stable');

    await expect(chooseSource([salon, cuisine])).resolves.toBe('stable');
    expect(offered()).toEqual(['stable']);
  });

  it('asks even when a single source is all there is', async () => {
    fake.sources = { tizen: ['stable'] };
    fake.select.mockResolvedValue('stable');

    await expect(chooseSource([salon])).resolves.toBe('stable');
    expect(fake.select).toHaveBeenCalledTimes(1);
  });

  it('asks once about several sets of the same platform', async () => {
    fake.select.mockResolvedValue('local');

    await chooseSource([salon, chambre]);

    expect(offered()).toEqual(['local', 'stable', 'build']);
  });

  it('asks nothing when the chosen platforms share no source', async () => {
    fake.sources = { tizen: ['local'], webos: ['canary'] };

    await expect(chooseSource([salon, cuisine])).resolves.toBeUndefined();
    expect(fake.select).not.toHaveBeenCalled();
  });

  it('asks nothing when no set was chosen', async () => {
    await expect(chooseSource([])).resolves.toBeUndefined();
    expect(fake.select).not.toHaveBeenCalled();
  });

  it('answers null when the choice is quit', async () => {
    fake.select.mockResolvedValue(fake.CANCELLED);

    await expect(chooseSource([salon])).resolves.toBeNull();
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
