import type { CapabilitySource } from '@kromatv/client/capabilities';
import { WatchableProgress } from '@kromatv/client/watchable';
import { describe, expect, it } from 'vitest';
import { createTranslator } from './i18n';
import { arrivalOf } from './watchable-arrival';

const t = createTranslator('en');

const TORRENTS: CapabilitySource = {
  mount: '/api/module/tv.kroma.torrents',
  label: 'Torrents',
  icon: 'magnet',
  figures: [
    { key: 'downloaded', label: 'Téléchargé', kind: 'percent' },
    { key: 'speed', label: 'Vitesse', kind: 'rate' },
    { key: 'sources', label: 'Pairs', kind: 'ratio' },
  ],
  map: { label: 'Morceaux reçus' },
  actions: [],
};

const DECLARED = WatchableProgress.parse({
  progress: 0.42,
  figures: { downloaded: 0.42, speed: 318_000, sources: [31, 498] },
  slices: [100, 98, 0],
  arriving: [2],
});

const OLD = WatchableProgress.parse({
  progress: 0.42,
  downBps: 318_000,
  upBps: 0,
  peers: 31,
  peersSeen: 498,
  pieces: [100, 98, 0],
});

const read = (source: CapabilitySource | null, progress: WatchableProgress | null) =>
  arrivalOf({ source, progress, t, locale: 'en' });

describe('what a viewer is shown while a file arrives', () => {
  it('reads each declared figure by the kind it was declared under', () => {
    const arrival = read(TORRENTS, DECLARED);

    expect(arrival.readings).toEqual([
      { key: 'downloaded', label: 'Téléchargé', text: '42%' },
      { key: 'speed', label: 'Vitesse', text: '311 KB/s' },
      { key: 'sources', label: 'Pairs', text: '31 / 498' },
    ]);
  });

  it("names the share after the source's own percent figure", () => {
    expect(read(TORRENTS, DECLARED).share).toEqual({ label: 'Téléchargé', text: '42%' });
  });

  it('answers a share of nothing before the source has reported any', () => {
    expect(read(TORRENTS, null).share).toEqual({ label: 'Téléchargé', text: '0%' });
  });

  it('falls back to its own word for a source that declares no percent figure', () => {
    const rateOnly = {
      ...TORRENTS,
      figures: [{ key: 'speed', label: 'Vitesse', kind: 'rate' as const }],
    };

    expect(read(rateOnly, DECLARED).share).toEqual({
      label: t('requests.watchStatDownloaded'),
      text: '42%',
    });
  });

  it('draws the slice map, and the slices on their way, only for a source that reports one', () => {
    const mapless = read({ ...TORRENTS, map: null }, DECLARED);

    expect(read(TORRENTS, DECLARED)).toMatchObject({
      mapLabel: 'Morceaux reçus',
      slices: [100, 98, 0],
      arriving: [2],
    });
    expect(mapless).toMatchObject({ mapLabel: null, slices: [], arriving: [] });
  });

  it('names the rate it charts, and reads a zero as a stall rather than as nothing', () => {
    const stalled = WatchableProgress.parse({ ...DECLARED, figures: { speed: 0 } });

    expect(read(TORRENTS, DECLARED).rate).toEqual({ bps: 318_000, text: '311 KB/s' });
    expect(read(TORRENTS, stalled).rate?.bps).toBe(0);
  });

  it('drops a figure whose value does not match the kind it was declared under', () => {
    const wrong = WatchableProgress.parse({ progress: 0.1, figures: { speed: 'fast' } });
    const rateOnly = {
      ...TORRENTS,
      figures: [{ key: 'speed', label: 'Vitesse', kind: 'rate' as const }],
    };

    expect(read(rateOnly, wrong).readings).toEqual([]);
  });
});

describe('a module that predates the declaration', () => {
  it('reads its older field names back as the same three figures', () => {
    expect(read(null, OLD).readings.map((reading) => reading.text)).toEqual([
      '42%',
      '311 KB/s',
      '31 / 498',
    ]);
  });

  it('is read the same way by a source that declares those three and sends neither', () => {
    expect(read(TORRENTS, OLD).readings.map((reading) => reading.label)).toEqual([
      'Téléchargé',
      'Vitesse',
      'Pairs',
    ]);
  });

  it("keeps its slice map, under the core's own word for it, with nothing marked on its way", () => {
    expect(read(null, OLD)).toMatchObject({
      mapLabel: t('requests.watchPieces'),
      slices: [100, 98, 0],
      arriving: [],
    });
  });
});
