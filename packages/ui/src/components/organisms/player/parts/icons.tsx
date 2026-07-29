/**
 * Shared player glyphs: one semantic set for web + TV so the unified chrome
 * renders identical iconography everywhere. Each entry names the design's intent
 * (IconBack10, IconVolMin, IconQuality) rather than the drawing, which is why
 * this layer exists at all: the chrome asks for "the rewind glyph" and this file
 * decides that the design draws it as a double chevron.
 *
 * They render through the kit's <Icon>, whose path data is generated from
 * @tabler/icons, so the same components compile for Apple TV and Android TV.
 */

import { Icon, type IconName } from '#ui/components/atoms/icon';
import type { ColorToken } from '#ui/lib/tokens';

type P = Readonly<{ size?: number; stroke?: number; color?: ColorToken | (string & {}) }>;

/** Build one semantic glyph: a fixed drawing with the design's default metrics. */
function glyph(name: IconName, defaultSize: number, defaultStroke?: number) {
  return function Glyph({ size = defaultSize, stroke = defaultStroke, color }: P) {
    return <Icon name={name} size={size} stroke={stroke} color={color ?? '#FFFFFF'} />;
  };
}

export const IconPlay = glyph('player-play-filled', 30);
export const IconPause = glyph('player-pause-filled', 28);
// The design draws rewind / forward as double-chevrons (the +/-10s transport),
// not the circular "10" glyph, so match that.
export const IconBack10 = glyph('chevrons-left', 27, 1.8);
export const IconFwd10 = glyph('chevrons-right', 27, 1.8);
export const IconNext = glyph('player-track-next-filled', 24);
export const IconVolHigh = glyph('volume', 22, 1.8);
export const IconVolLow = glyph('volume-2', 22, 1.8);
export const IconVolMin = glyph('volume-3', 22, 1.8);
export const IconMute = glyph('volume-off', 22, 1.8);
export const IconSubtitles = glyph('badge-cc', 22, 1.8);
export const IconAudioTrack = glyph('wave-sine', 22, 1.8);
export const IconGear = glyph('settings', 22, 1.8);
export const IconPip = glyph('picture-in-picture', 22, 1.8);
export const IconCast = glyph('cast', 22, 1.8);
export const IconFullscreen = glyph('maximize', 22, 1.8);
export const IconFullscreenExit = glyph('minimize', 22, 1.8);
export const IconBack = glyph('chevron-left', 20, 2);
export const IconForward = glyph('chevron-right', 20, 2);
export const IconExpand = glyph('chevron-up', 22, 2);
export const IconCollapse = glyph('chevron-down', 22, 2);
export const IconClose = glyph('x', 18, 1.8);
export const IconOk = glyph('check', 18, 2.2);
export const IconAi = glyph('sparkles', 13, 2);
export const IconDelete = glyph('trash', 16, 1.8);
export const IconStats = glyph('chart-bar', 22, 1.8);
// Settings-menu row glyphs (§5): quality / audio-filter / appearance / speed.
export const IconQuality = glyph('badge-4k', 22, 1.8);
export const IconAudioFilter = glyph('adjustments-horizontal', 22, 1.8);
export const IconAppearance = glyph('typography', 22, 1.8);
export const IconSpeed = glyph('gauge', 22, 1.8);
export const IconReport = glyph('flag', 22, 1.8);
export const IconStop = glyph('player-stop-filled', 52);
export const IconEndsAt = glyph('clock', 15, 1.8);
export const IconRestart = glyph('rotate-clockwise-2', 18, 1.8);
