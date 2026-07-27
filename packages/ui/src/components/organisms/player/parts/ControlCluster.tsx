import type { MessageKey } from '@kroma/core';
import { memo, type ReactNode, useCallback, useMemo } from 'react';
import { type GestureResponderEvent, PanResponder, View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { IconButton } from '#ui/components/atoms/icon-button';
import { colors } from '#ui/lib/tokens';
import { useT } from '#ui/services/i18n';
import { useDragTrack } from '../hooks/useDragTrack';
import { clamp01, sliderToVolume, volumeToSlider } from '../lib/fmt';
import type { ControlId } from '../lib/nav';
import { CTRL_OFF, CTRL_ON, FOCUS_SCALE, FOCUS_SHADOW } from '../lib/style';
import {
  IconAudioTrack,
  IconBack10,
  IconFullscreen,
  IconFullscreenExit,
  IconFwd10,
  IconGear,
  IconMute,
  IconNext,
  IconPause,
  IconPip,
  IconPlay,
  IconSubtitles,
  IconVolHigh,
  IconVolLow,
} from './icons';

const TRANSPORT: ReadonlySet<ControlId> = new Set<ControlId>(['rewind', 'play', 'forward']);
/** The focused control lifts and takes the amber ring; the fill brightens too.
 * (Kept for the volume pill, whose wrapper is not a kit atom: the pill holds a
 * button AND a slider, so the focus visuals live on the wrapper.) */
const FOCUS_POP = { boxShadow: FOCUS_SHADOW, transform: [{ scale: FOCUS_SCALE }] };
const circleFill = (focused: boolean) => ({
  backgroundColor: focused ? CTRL_ON : CTRL_OFF,
});
/** The focused play key steps to the accent's hover fill, as it always did. */
const PLAY_BRIGHTEN = { backgroundColor: colors.accentHover };

export interface ControlClusterProps {
  controls: ControlId[];
  focused: ControlId | null;
  playing: boolean;
  muted: boolean;
  volume: number;
  pipActive: boolean;
  fullscreen: boolean;
  /** Run a control (mouse click shares this with D-pad OK). */
  onActivate: (id: ControlId) => void;
  /** Hover moves focus (§15). */
  onFocus: (id: ControlId) => void;
  onVolume: (v: number) => void;
}

/** Circular control button matching the design (state-driven focus, kit atom in
 * controlled mode: `focused` is ALWAYS passed, so it never becomes a platform /
 * navigator focus target - see ../lib/virtual-focus.ts). */
function Circle({
  id,
  size,
  focused,
  label,
  onActivate,
  onFocus,
  children,
}: Readonly<{
  id: ControlId;
  size: number;
  focused: boolean;
  label: string;
  onActivate: (id: ControlId) => void;
  onFocus: (id: ControlId) => void;
  children: ReactNode;
}>) {
  return (
    <IconButton
      variant="glass"
      size={size}
      focused={focused}
      focusedStyle={BRIGHTEN}
      label={label}
      onPress={() => onActivate(id)}
      onHoverIn={() => onFocus(id)}
    >
      {children}
    </IconButton>
  );
}

/** The focused circle brightens its fill, on top of the kit's ring + scale. */
const BRIGHTEN = { backgroundColor: CTRL_ON };

/** Player state a circular control's glyph can depend on. */
interface GlyphState {
  pipActive: boolean;
  fullscreen: boolean;
}

/** Every control except play and volume is the SAME circular button, differing
 * only in diameter, accessible label and glyph, so they are a table rather than
 * eight near-identical JSX blocks. `pip` and `fullscreen` swap their glyph with
 * player state, which is why a glyph is a function of it. */
const CIRCLES: Record<
  Exclude<ControlId, 'play' | 'volume'>,
  { size: number; label: MessageKey; glyph: (s: GlyphState) => ReactNode }
> = {
  rewind: { size: 62, label: 'player.back10', glyph: () => <IconBack10 size={27} /> },
  forward: { size: 62, label: 'player.fwd10', glyph: () => <IconFwd10 size={27} /> },
  next: { size: 56, label: 'player.nextEpisode', glyph: () => <IconNext size={24} /> },
  subtitles: { size: 56, label: 'player.subtitles', glyph: () => <IconSubtitles size={25} /> },
  audio: { size: 56, label: 'player.audioTrack', glyph: () => <IconAudioTrack size={24} /> },
  settings: { size: 56, label: 'player.settings', glyph: () => <IconGear size={25} /> },
  pip: {
    size: 56,
    label: 'player.pip',
    glyph: ({ pipActive }) => <IconPip size={23} color={pipActive ? colors.accent : '#FFFFFF'} />,
  },
  fullscreen: {
    size: 56,
    label: 'player.fullscreen',
    glyph: ({ fullscreen }) =>
      fullscreen ? <IconFullscreenExit size={23} /> : <IconFullscreen size={23} />,
  },
};

/**
 * The middle control row (§4): centered transport (rewind / play / forward) plus
 * the feature-flagged cluster on the right (next / volume / subtitles / audio /
 * settings / pip / fullscreen). The `controls` array is already filtered by the
 * feature flags, so this only renders what is present (no dead buttons). Matches
 * the 10-foot layout of the design (62 / 80 / 62 transport, 56 cluster circles).
 *
 * Memoized: every prop is stable between playback ticks (the nav machine's
 * callbacks and `controls` array are referentially stable), so the row skips the
 * ~4 Hz timeupdate re-renders the rest of the chrome makes.
 */
export const ControlCluster = memo(function ControlCluster({
  controls,
  focused,
  playing,
  muted,
  volume,
  pipActive,
  fullscreen,
  onActivate,
  onFocus,
  onVolume,
}: Readonly<ControlClusterProps>) {
  const t = useT();
  const transport = controls.filter((c) => TRANSPORT.has(c));
  const cluster = controls.filter((c) => !TRANSPORT.has(c));

  const glyphState: GlyphState = { pipActive, fullscreen };

  const render = (id: ControlId) => {
    const on = focused === id;
    // The two controls that are not a plain circle: play carries the accent fill
    // and its own play/pause glyph, volume owns a slider.
    if (id === 'play') {
      return (
        <IconButton
          key={id}
          variant="primary"
          size={80}
          focused={on}
          focusedStyle={PLAY_BRIGHTEN}
          label={playing ? t('player.pause') : t('player.play')}
          onPress={() => onActivate(id)}
          onHoverIn={() => onFocus(id)}
        >
          {playing ? (
            <IconPause size={33} color={colors.accentInk} />
          ) : (
            <IconPlay size={35} color={colors.accentInk} />
          )}
        </IconButton>
      );
    }
    if (id === 'volume') {
      return (
        <VolumeControl
          key={id}
          focused={on}
          muted={muted}
          volume={volume}
          onFocus={() => onFocus(id)}
          onToggle={() => onActivate(id)}
          onVolume={onVolume}
          label={t('player.volume')}
          muteLabel={t('player.mute')}
        />
      );
    }
    const { size, label, glyph } = CIRCLES[id];
    return (
      <Circle
        key={id}
        id={id}
        size={size}
        focused={on}
        label={t(label)}
        onActivate={onActivate}
        onFocus={onFocus}
      >
        {glyph(glyphState)}
      </Circle>
    );
  };

  return (
    <Box row align="center" pt={4}>
      <Box flex />
      <Box row align="center" gap={20}>
        {transport.map(render)}
      </Box>
      <Box row flex align="center" justify="flex-end" gap={14}>
        {cluster.map(render)}
      </Box>
    </Box>
  );
});

/** Volume as an always-expanded pill (§4b): mute button + inline slider. */
function VolumeControl({
  focused,
  muted,
  volume,
  onFocus,
  onToggle,
  onVolume,
  label,
  muteLabel,
}: Readonly<{
  focused: boolean;
  muted: boolean;
  volume: number;
  onFocus: () => void;
  onToggle: () => void;
  onVolume: (v: number) => void;
  label: string;
  muteLabel: string;
}>) {
  // Measured on the RAIL, not on the row that holds it: the row is 96 wide with
  // 20 of right padding, so dividing a pointer offset by the row's width put the
  // level a fifth past the cursor. The two share a left edge, so a `locationX`
  // taken on the row is still an offset along the rail.
  const track = useDragTrack();
  const level = muted ? 0 : volume;
  // The fill and thumb track the perceptual slider position, not the raw
  // amplitude, so the handle sits under the pointer while the audio follows the
  // loudness curve (a linear fader would look wrong against a tapered volume).
  const sliderPos = muted ? 0 : volumeToSlider(volume);
  let volIcon: ReactNode;
  if (level === 0) volIcon = <IconMute size={24} />;
  else if (level < 0.5) volIcon = <IconVolLow size={24} />;
  else volIcon = <IconVolHigh size={24} />;

  const setAt = useCallback(
    (x: number) => {
      const offset = track.offsetOf(x);
      if (offset == null || track.width <= 0) return;
      onVolume(sliderToVolume(clamp01(offset / track.width)));
    },
    [onVolume, track.offsetOf, track.width],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          track.measure();
          setAt(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e: GestureResponderEvent) => setAt(e.nativeEvent.locationX),
      }),
    [setAt, track.measure],
  );

  return (
    <Box
      row
      align="center"
      shrink={0}
      h={56}
      radius="pill"
      overflow="hidden"
      onPointerEnter={onFocus}
      style={[circleFill(focused), focused ? FOCUS_POP : null]}
    >
      {/* Controlled at `false`: the PILL carries the focus visuals for the whole
          volume control, so the button itself never paints one - but it must
          still opt out of platform focus like everything else in the chrome. */}
      <IconButton variant="ghost" size={56} focused={false} label={muteLabel} onPress={onToggle}>
        {volIcon}
      </IconButton>
      <View
        {...pan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        style={{ height: 56, width: 96, justifyContent: 'center', paddingRight: 20 }}
      >
        <Box
          ref={track.ref}
          onLayout={track.onLayout}
          pointerEvents="none"
          h={6}
          w="100%"
          radius="pill"
          bg="rgba(255, 255, 255, 0.22)"
        >
          {/* The fill width and thumb offset vary with the volume, so they go
              through `style` (which bypasses the shared cache) rather than the
              `w` / `left` shorthands, which would mint a cache entry per level. */}
          <Box
            absolute
            top={0}
            bottom={0}
            left={0}
            radius="pill"
            bg="accent"
            style={{ width: `${sliderPos * 100}%` }}
          />
          <Box
            absolute
            top="50%"
            w={13}
            h={13}
            radius="pill"
            bg="#FFFFFF"
            style={[THUMB, { left: `${sliderPos * 100}%` }]}
          />
        </Box>
      </View>
    </Box>
  );
}

const THUMB = {
  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.5)',
  transform: [{ translateX: -6.5 }, { translateY: -6.5 }],
};
