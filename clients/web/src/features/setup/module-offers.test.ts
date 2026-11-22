import { StoreCatalog } from '@kromatv/client/modules';
import { expect, it } from 'vitest';
import { offerState, offers, pickedBytes } from './module-offers';

interface Entry {
  id: string;
  points?: string[];
  needs?: string[];
  installed?: string;
  library?: true;
  source?: string;
  size?: number | null;
}

const entry = ({
  id,
  points = [],
  needs = [],
  installed,
  library,
  source,
  size = 1000,
}: Entry) => ({
  id,
  name: id,
  version: '1.0.0',
  description: `What ${id} does`,
  library: library ?? false,
  dependencies: Object.fromEntries(needs.map((needed) => [needed, '^1.0.0'])),
  optionalDependencies: {},
  contributes: points.map((point) => ({ point })),
  consumes: [],
  size,
  installedVersion: installed,
  updateAvailable: false,
  compatible: true,
  source: source ?? 'Official',
});

const catalog = (entries: Entry[], setup = entries.map((offered) => offered.id)) =>
  StoreCatalog.parse({
    schema: 3,
    serverVersion: '0.1.40',
    registryUrl: 'https://modules.example/registry.json',
    registries: [
      {
        name: 'Official',
        url: 'https://modules.example/registry.json',
        official: true,
        enabled: true,
        moduleCount: entries.length,
        shadowed: [],
      },
    ],
    modules: entries.map(entry),
    setup,
  });

const ids = (all: { module: { id: string } }[]) => all.map((offer) => offer.module.id);

it('offers what the official registry lists for the setup, in its order', () => {
  const all = offers(
    catalog(
      [{ id: 'tv.test.discovery' }, { id: 'tv.test.subtitles' }, { id: 'tv.test.parser' }],
      ['tv.test.subtitles', 'tv.test.discovery'],
    ),
  );

  expect(ids(all)).toEqual(['tv.test.subtitles', 'tv.test.discovery']);
});

it('offers nothing the catalog does not carry', () => {
  const all = offers(catalog([{ id: 'tv.test.discovery' }], ['tv.test.gone']));

  expect(all).toEqual([]);
});

it('keeps a module the server holds in the list, as installed', () => {
  const [held] = offers(catalog([{ id: 'tv.test.subtitles', installed: '1.0.0' }]));

  expect(held?.installed).toBe(true);
});

it('names what a module cannot run without, through every level, once', () => {
  const [offer] = offers(
    catalog([
      { id: 'tv.test.get', points: ['acquisition'], needs: ['tv.test.downloads'] },
      { id: 'tv.test.downloads', points: ['tv.test.downloads/grab'], needs: ['tv.test.index'] },
      { id: 'tv.test.index', points: ['tv.test.index/search'] },
    ]),
  );

  expect(offer?.needs.map((needed) => String(needed.id))).toEqual([
    'tv.test.downloads',
    'tv.test.index',
  ]);
});

it('does not count a needed module the server already holds', () => {
  const [offer] = offers(
    catalog([
      { id: 'tv.test.get', points: ['acquisition'], needs: ['tv.test.downloads'] },
      { id: 'tv.test.downloads', points: ['tv.test.downloads/grab'], installed: '1.0.0' },
    ]),
  );

  expect(offer?.needs).toEqual([]);
});

it('counts a module two selections both need once', () => {
  const all = offers(
    catalog([
      { id: 'tv.test.get', points: ['acquisition'], needs: ['tv.test.downloads'] },
      { id: 'tv.test.vpn', points: ['network'], needs: ['tv.test.downloads'] },
      { id: 'tv.test.downloads', points: ['tv.test.downloads/grab'] },
    ]),
  );

  expect(pickedBytes(all, ['tv.test.get', 'tv.test.vpn'])).toBe(3000);
  expect(pickedBytes(all, [])).toBe(0);
});

it('counts a module of unknown size as nothing to download', () => {
  const all = offers(
    catalog([
      { id: 'tv.test.get', points: ['acquisition'] },
      { id: 'tv.test.vpn', points: ['network'], size: null },
    ]),
  );

  expect(pickedBytes(all, ['tv.test.get', 'tv.test.vpn'])).toBe(1000);
});

it('reads an offer as open, selected, or on its way to the server', () => {
  const [offer] = offers(catalog([{ id: 'tv.test.subtitles', points: ['transcriber'] }]));
  const none = { picked: [], dropped: [], started: [] };

  expect(offer && offerState(offer, none)).toBe('open');
  expect(offer && offerState(offer, { ...none, picked: ['tv.test.subtitles'] })).toBe('picked');
  expect(offer && offerState(offer, { ...none, started: ['tv.test.subtitles'] })).toBe(
    'installing',
  );
});

it('reads a module the server holds as installed, until the owner deselects it', () => {
  const [held] = offers(catalog([{ id: 'tv.test.subtitles', installed: '1.0.0' }]));
  const none = { picked: [], dropped: [], started: [] };

  expect(held && offerState(held, none)).toBe('installed');
  expect(held && offerState(held, { ...none, dropped: ['tv.test.subtitles'] })).toBe('leaving');
});
