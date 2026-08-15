import type { UpNextItem } from '#ui/components/organisms/player/parts/up-next-card';

import { stillArt } from '#ui/lib/sample-art';

export const episode = (at: number): UpNextItem => ({
  id: `ep-${at}`,
  title: ['The Kingsroad', 'Lord Snow', 'Cripples and Broken Things'][at] ?? `Episode ${at + 2}`,
  subtitle: `S1 E${at + 2}`,
  posterUrl: stillArt(at),
  categoryLabel: 'Episode',
});

export const recommendation = (at: number): UpNextItem => ({
  id: `rec-${at}`,
  title: ['Blade Runner 2049', 'Arrival', 'Dune'][at] ?? `Title ${at}`,
  subtitle: ['2017', '2016', '2021'][at] ?? '',
  posterUrl: stillArt(at + 3),
  categoryLabel: 'Science fiction',
});

export const DATA = {
  nextEpisodes: [0, 1, 2].map(episode),
  recommendations: [0, 1, 2].map(recommendation),
};
