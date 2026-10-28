import type { MessageKey } from '@kromatv/i18n';
import { memo, type ReactNode } from 'react';
import { IconButton } from '#ui/components/atoms/icon-button';
import { CONTROL_SIZE, type Px, scaler } from '#ui/components/organisms/player/lib/metrics';
import type { ControlId } from '#ui/components/organisms/player/lib/nav';
import {
  IconAudioTrack,
  IconSkipBack,
  IconCast,
  IconFullscreen,
  IconFullscreenExit,
  IconSkipForward,
  IconGear,
  IconNext,
  IconPip,
  IconSubtitles,
} from '#ui/components/organisms/player/parts/icons';
import { NO_OUTLINE } from '#ui/lib/field-shell';
import { useT } from '#ui/services/i18n';

const CIRCLE_FOCUS = { focus: { bg: 'tint/22' } } as const;

interface CircleProps {
  id: ControlId;
  diameter: number;
  label: string;
  onActivate: (id: ControlId) => void;
  onFocus: (id: ControlId) => void;
  onBlur: (id: ControlId) => void;
  children: ReactNode;
}

export function Circle({
  id,
  diameter,
  label,
  onActivate,
  onFocus,
  onBlur,
  children,
}: Readonly<CircleProps>) {
  return (
    <IconButton
      variant="glass"
      diameter={diameter}
      style={NO_OUTLINE}
      states={CIRCLE_FOCUS}
      label={label}
      onPress={() => onActivate(id)}
      onFocus={() => onFocus(id)}
      onBlur={() => onBlur(id)}
    >
      {children}
    </IconButton>
  );
}

interface GlyphState {
  pipActive: boolean;
  fullscreen: boolean;
}

export type CircleId = Exclude<ControlId, 'play' | 'volume'>;

const CIRCLES: Record<
  CircleId,
  { label: MessageKey; glyph: (s: GlyphState, px: Px) => ReactNode }
> = {
  rewind: { label: 'player.back10', glyph: (_s, px) => <IconSkipBack size={px(27)} /> },
  forward: { label: 'player.fwd10', glyph: (_s, px) => <IconSkipForward size={px(27)} /> },
  next: { label: 'player.nextEpisode', glyph: (_s, px) => <IconNext size={px(24)} /> },
  subtitles: { label: 'player.subtitles', glyph: (_s, px) => <IconSubtitles size={px(25)} /> },
  audio: { label: 'player.audioTrack', glyph: (_s, px) => <IconAudioTrack size={px(24)} /> },
  settings: { label: 'player.settings', glyph: (_s, px) => <IconGear size={px(25)} /> },
  cast: { label: 'cast.moveToTv', glyph: (_s, px) => <IconCast size={px(24)} /> },
  pip: {
    label: 'player.pip',
    glyph: ({ pipActive }, px) => (
      <IconPip size={px(23)} color={pipActive ? 'accent' : '#FFFFFF'} />
    ),
  },
  fullscreen: {
    label: 'player.fullscreen',
    glyph: ({ fullscreen }, px) =>
      fullscreen ? <IconFullscreenExit size={px(23)} /> : <IconFullscreen size={px(23)} />,
  },
};

interface CircleControlProps {
  id: CircleId;
  scale: number;
  pipActive: boolean;
  fullscreen: boolean;
  onActivate: (id: ControlId) => void;
  onFocus: (id: ControlId) => void;
  onBlur: (id: ControlId) => void;
}

export const CircleControl = memo(function CircleControl({
  id,
  scale,
  pipActive,
  fullscreen,
  onActivate,
  onFocus,
  onBlur,
}: Readonly<CircleControlProps>) {
  const t = useT();
  const px = scaler(scale);
  const { label, glyph } = CIRCLES[id];
  return (
    <Circle
      id={id}
      diameter={px(CONTROL_SIZE[id])}
      label={t(label)}
      onActivate={onActivate}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {glyph({ pipActive, fullscreen }, px)}
    </Circle>
  );
});
