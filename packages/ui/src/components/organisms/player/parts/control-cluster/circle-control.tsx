import type { MessageKey } from '@kromatv/i18n';
import { memo, type ReactNode, useMemo } from 'react';
import { IconButton } from '#ui/components/atoms/icon-button';
import { CONTROL_SIZE, type Px, scaler } from '#ui/components/organisms/player/lib/metrics';
import type { ControlId } from '#ui/components/organisms/player/lib/nav';
import {
  IconAudioTrack,
  IconBack10,
  IconCast,
  IconFullscreen,
  IconFullscreenExit,
  IconFwd10,
  IconGear,
  IconNext,
  IconPip,
  IconSubtitles,
} from '#ui/components/organisms/player/parts/icons';
import { sv, useSv } from '#ui/core';
import { NO_OUTLINE } from '#ui/lib/field-shell';
import { useFocusVisible } from '#ui/lib/focus-visible';
import { useT } from '#ui/services/i18n';

const circleFill = sv({ base: { _focus: { bg: 'tint/22' } } });

interface CircleProps {
  id: ControlId;
  diameter: number;
  focused: boolean;
  label: string;
  onActivate: (id: ControlId) => void;
  onFocus: (id: ControlId) => void;
  children: ReactNode;
}

export function Circle({
  id,
  diameter,
  focused,
  label,
  onActivate,
  onFocus,
  children,
}: Readonly<CircleProps>) {
  const circleFillScoped = useSv(circleFill);

  const lit = useFocusVisible(focused);
  const dress = useMemo(
    () => [circleFillScoped(undefined, { focus: lit }).root, NO_OUTLINE],
    [lit, circleFillScoped],
  );
  return (
    <IconButton
      variant="glass"
      diameter={diameter}
      focused={focused}
      style={dress}
      label={label}
      onPress={() => onActivate(id)}
      onHoverIn={() => onFocus(id)}
      onFocus={() => onFocus(id)}
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
  rewind: { label: 'player.back10', glyph: (_s, px) => <IconBack10 size={px(27)} /> },
  forward: { label: 'player.fwd10', glyph: (_s, px) => <IconFwd10 size={px(27)} /> },
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
  focused: boolean;
  scale: number;
  pipActive: boolean;
  fullscreen: boolean;
  onActivate: (id: ControlId) => void;
  onFocus: (id: ControlId) => void;
}

export const CircleControl = memo(function CircleControl({
  id,
  focused,
  scale,
  pipActive,
  fullscreen,
  onActivate,
  onFocus,
}: Readonly<CircleControlProps>) {
  const t = useT();
  const px = scaler(scale);
  const { label, glyph } = CIRCLES[id];
  return (
    <Circle
      id={id}
      diameter={px(CONTROL_SIZE[id])}
      focused={focused}
      label={t(label)}
      onActivate={onActivate}
      onFocus={onFocus}
    >
      {glyph({ pipActive, fullscreen }, px)}
    </Circle>
  );
});
