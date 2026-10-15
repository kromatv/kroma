import { type ReactNode, useState } from 'react';
import { Img } from '#ui/components/atoms/img';

import { stillArt } from '#ui/lib/sample-art';

import { DEFAULT_SUB_APPEARANCE, type SubtitleAppearance } from './lib/subtitle-appearance';
import type { SubtitleGenBundle } from './parts/settings-panel/settings/gen';

import type { PlayerFlags } from './types';

export const WEB: PlayerFlags = { volume: true, pip: true, fullscreen: true, pointer: true };

export const TV: PlayerFlags = { volume: false, pip: false, fullscreen: false, pointer: false };

export const RELEASE = 'Sintel.2010.1080p.BluRay.x264-CtrlHD';

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

export const ASPECTS: Record<string, number> = {
  scope: 2.39,
  widescreen: 16 / 9,
  academy: 4 / 3,
  square: 1,
  vertical: 9 / 16,
};

export function Surface() {
  return <Img src={stillArt(1)} fill fit="cover" />;
}

/** Subtitle appearance that remembers what the panel sets, so a story's ◀▶ and
 *  swatches take effect. A story's `render` is called as a plain function, so
 *  the state has to live in a component of its own. */
export function LiveAppearance({
  children,
}: Readonly<{
  children: (
    appearance: SubtitleAppearance,
    onAppearanceChange: (patch: Partial<SubtitleAppearance>) => void,
  ) => ReactNode;
}>) {
  const [appearance, setAppearance] = useState(DEFAULT_SUB_APPEARANCE);
  return children(appearance, (patch) => setAppearance((prev) => ({ ...prev, ...patch })));
}
