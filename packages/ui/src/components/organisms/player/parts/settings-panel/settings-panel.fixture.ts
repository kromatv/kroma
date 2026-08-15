// What both settings-panel tests need before they can render one: a controller
// with every track list empty, and the two bundles the panel takes as props.
// Shared rather than written twice, so a change to <PlayerController> lands in
// one place and neither test drifts into standing for a different player.

import { vi } from 'vitest';
import type { SubtitleAppearance } from '#ui/components/organisms/player/lib/subtitle-appearance';
import type { PlayerController } from '#ui/components/organisms/player/types';
import type { SubtitleGenBundle } from './settings/gen';

/** A player that offers nothing: the panel's own rows are what the tests are
 *  reading, so every list it could fill is empty. */
export function controller(): PlayerController {
  return {
    qualities: [],
    qualityId: '',
    setQuality: vi.fn(),
    audioTracks: [],
    audioIndex: null,
    setAudio: vi.fn(),
    audioFilter: 'off',
    audioFilterSupported: false,
    setAudioFilter: vi.fn(),
    subtitles: [],
    subtitleIndex: null,
    setSubtitle: vi.fn(),
    muted: false,
    rate: 1,
    setRate: vi.fn(),
  } as unknown as PlayerController;
}

export const GEN = { supported: false } as unknown as SubtitleGenBundle;
export const APPEARANCE = {} as SubtitleAppearance;
