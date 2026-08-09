// Shared player glyphs for web + TV. Each entry names the design's intent
// rather than the drawing, so the chrome asks for "the rewind glyph".

import { Icon, type IconName } from '#ui/components/atoms/icon';
import type { ColorToken } from '#ui/core';

type P = Readonly<{ size?: number; stroke?: number; color?: ColorToken | (string & {}) }>;

function glyph(name: IconName, defaultSize: number, defaultStroke?: number) {
  return function Glyph({ size = defaultSize, stroke = defaultStroke, color }: P) {
    return <Icon name={name} size={size} stroke={stroke} color={color ?? '#FFFFFF'} />;
  };
}

export const IconPlay = glyph('player-play-filled', 30);
export const IconPause = glyph('player-pause-filled', 28);
// The design draws the +/-10s transport as double-chevrons, not a circular "10".
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
export const IconForward = glyph('chevron-right', 20, 2);
export const IconExpand = glyph('chevron-up', 22, 2);
export const IconCollapse = glyph('chevron-down', 22, 2);
export const IconClose = glyph('x', 18, 1.8);
export const IconOk = glyph('check', 18, 2.2);
export const IconAi = glyph('sparkles', 13, 2);
export const IconDelete = glyph('trash', 16, 1.8);
export const IconStats = glyph('chart-bar', 22, 1.8);
export const IconQuality = glyph('badge-4k', 22, 1.8);
export const IconAudioFilter = glyph('adjustments-horizontal', 22, 1.8);
export const IconAppearance = glyph('typography', 22, 1.8);
export const IconSpeed = glyph('gauge', 22, 1.8);
export const IconReport = glyph('flag', 22, 1.8);
export const IconStop = glyph('player-stop-filled', 52);
export const IconEndsAt = glyph('clock', 15, 1.8);
export const IconRestart = glyph('rotate-clockwise-2', 18, 1.8);
