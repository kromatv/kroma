import { Img } from '#ui/components/atoms/img';

import { stillArt } from '#ui/lib/sample-art';

import type { SubtitleGenBundle } from './parts/settings-panel/settings/gen';

import type { PlayerFlags } from './types';

export const WEB: PlayerFlags = { volume: true, pip: true, fullscreen: true, pointer: true };

export const TV: PlayerFlags = { volume: false, pip: false, fullscreen: false, pointer: false };

export const NO_GEN: SubtitleGenBundle = {
  canCreate: false,
  caps: null,
  pending: [],
  onCancel: () => {},
  onDelete: () => {},
  onStart: () => {},
};

export const UP_NEXT = {
  nextEpisodes: [0, 1, 2].map((at) => ({
    id: `ep-${at}`,
    title: `Episode ${at + 2}`,
    subtitle: `S1 E${at + 2}`,
    posterUrl: stillArt(at),
    categoryLabel: 'Episode',
  })),
  recommendations: [3, 4, 5].map((at) => ({
    id: `rec-${at}`,
    title: `Recommendation ${at}`,
    subtitle: '2021',
    posterUrl: stillArt(at),
    categoryLabel: 'Science fiction',
  })),
};

export function Surface() {
  return <Img src={stillArt(1)} fill fit="cover" />;
}
