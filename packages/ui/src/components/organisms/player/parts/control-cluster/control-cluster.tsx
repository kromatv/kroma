import type { MessageKey } from '@kroma/core';
import { memo, type ReactNode, useEffect, useEffectEvent, useRef, useState } from 'react';
import { type GestureResponderEvent, PanResponder, View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { IconButton } from '#ui/components/atoms/icon-button';
import { useDragTrack } from '#ui/components/organisms/player/hooks/use-drag-track';
import { clamp01, sliderToVolume, volumeToSlider } from '#ui/components/organisms/player/lib/fmt';
import {
  type ChromeMetrics,
  CLUSTER_GAP,
  CONTROL_SIZE,
  isTransport,
  type Px,
  ROW_GAP,
  scaler,
  TRANSPORT_GAP,
  VOLUME_RAIL,
} from '#ui/components/organisms/player/lib/metrics';
import type { ControlId } from '#ui/components/organisms/player/lib/nav';
import { FOCUS_SCALE } from '#ui/components/organisms/player/lib/style';
import {
  IconAudioTrack,
  IconBack10,
  IconCast,
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
} from '#ui/components/organisms/player/parts/icons';
import { styles, sv } from '#ui/core';
import { a11yValue } from '#ui/lib/a11y';
import { suppressSelection } from '#ui/lib/drag-select';
import { useFocusVisible } from '#ui/lib/focus-visible';
import { useT } from '#ui/services/i18n';

const circleFill = sv({ base: { _focus: { bg: 'tint/22' } } });
const playFill = sv({ base: { _focus: { bg: 'accentHover' } } });
// The volume pill's wrapper isn't a kit atom (it holds a button AND a slider),
// so its focus visuals live on the wrapper itself.
const volumePill = sv({
  base: {
    bg: 'tint/12',
    _focus: { bg: 'tint/22', ring: 'focusLift', transform: [{ scale: FOCUS_SCALE }], z: 1 },
  },
});

export interface ControlClusterProps {
  focused: ControlId | null;
  playing: boolean;
  muted: boolean;
  volume: number;
  pipActive: boolean;
  fullscreen: boolean;
  /** How the row fits the stage it is drawn on (see ../lib/metrics): WHICH
   *  controls there is room for, the scale they are drawn at, and whether the
   *  volume rail survived. The list is not a separate prop because the row and
   *  the nav machine must agree on it exactly - they read the same one. */
  metrics: ChromeMetrics;
  /** Run a control (mouse click shares this with D-pad OK). */
  onActivate: (id: ControlId) => void;
  /** Hover moves focus (§15). */
  onFocus: (id: ControlId) => void;
  onVolume: (v: number) => void;
}

// Controlled focus (state-driven, not platform/navigator focus; see
// ../lib/virtual-focus.ts): `focused` is ALWAYS passed explicitly.
function Circle({
  id,
  diameter,
  focused,
  label,
  onActivate,
  onFocus,
  children,
}: Readonly<{
  id: ControlId;
  diameter: number;
  focused: boolean;
  label: string;
  onActivate: (id: ControlId) => void;
  onFocus: (id: ControlId) => void;
  children: ReactNode;
}>) {
  const lit = useFocusVisible(focused);
  return (
    <IconButton
      variant="glass"
      diameter={diameter}
      focused={focused}
      style={circleFill(undefined, { focus: lit }).root}
      label={label}
      onPress={() => onActivate(id)}
      onHoverIn={() => onFocus(id)}
    >
      {children}
    </IconButton>
  );
}

interface GlyphState {
  pipActive: boolean;
  fullscreen: boolean;
}

// Shared by the volume pill and the bare mute key a narrow row collapses to,
// so the two never disagree about what "muted" looks like.
function volumeGlyph(level: number, size: number): ReactNode {
  if (level === 0) return <IconMute size={size} />;
  if (level < 0.5) return <IconVolLow size={size} />;
  return <IconVolHigh size={size} />;
}

// Every control except play and volume is the SAME circular button, differing
// only in label and glyph: a table instead of eight near-identical JSX blocks.
// `pip`/`fullscreen` glyphs depend on player state; every glyph draws at scale.
const CIRCLES: Record<
  Exclude<ControlId, 'play' | 'volume'>,
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

/**
 * The middle control row (§4): centered transport (rewind/play/forward) plus the
 * feature-flagged cluster (next/volume/subtitles/audio/settings/cast/pip/
 * fullscreen). Renders exactly `metrics.controls` (already filtered by feature
 * flags and available width), so it never draws a dead button, and always fits
 * on one line by shrinking then shedding controls (see ../lib/metrics
 * `chromeMetrics`); a shed control is reported via `metrics.overflow`.
 *
 * Memoized: every prop is stable between playback ticks, so the row skips the
 * ~4 Hz timeupdate re-renders the rest of the chrome makes.
 */
export const ControlCluster = memo(function ControlCluster({
  focused,
  playing,
  muted,
  volume,
  pipActive,
  fullscreen,
  metrics,
  onActivate,
  onFocus,
  onVolume,
}: Readonly<ControlClusterProps>) {
  const t = useT();
  const { scale, controls, rail, clusterWidth } = metrics;
  const px = scaler(scale);
  const transport = controls.filter(isTransport);
  const cluster = controls.filter((c) => !isTransport(c));

  const glyphState: GlyphState = { pipActive, fullscreen };
  // Keyed on WHICH control holds the focus: the selection moves within the
  // cluster, so the modality has to be re-read on every move.
  const lit = useFocusVisible(focused);

  const render = (id: ControlId) => {
    const on = focused === id;
    // The two controls that are not a plain circle: play carries the accent fill
    // and its own play/pause glyph, volume owns a slider.
    if (id === 'play') {
      return (
        <IconButton
          key={id}
          variant="primary"
          diameter={px(CONTROL_SIZE.play)}
          focused={on}
          style={playFill(undefined, { focus: lit && on }).root}
          label={playing ? t('player.pause') : t('player.play')}
          onPress={() => onActivate(id)}
          onHoverIn={() => onFocus(id)}
        >
          {playing ? (
            <IconPause size={px(33)} color="accentInk" />
          ) : (
            <IconPlay size={px(35)} color="accentInk" />
          )}
        </IconButton>
      );
    }
    if (id === 'volume') {
      // Too narrow for the rail: the pill collapses to the mute key it's built
      // around. The level is still adjustable via the keyboard/remote.
      if (!rail) {
        return (
          <Circle
            key={id}
            id={id}
            diameter={px(CONTROL_SIZE.volume)}
            focused={on}
            label={t('player.mute')}
            onActivate={onActivate}
            onFocus={onFocus}
          >
            {volumeGlyph(muted ? 0 : volume, px(24))}
          </Circle>
        );
      }
      return (
        <VolumeControl
          key={id}
          focused={on}
          muted={muted}
          volume={volume}
          px={px}
          onFocus={() => onFocus(id)}
          onToggle={() => onActivate(id)}
          onVolume={onVolume}
          label={t('player.volume')}
          muteLabel={t('player.mute')}
        />
      );
    }
    const { label, glyph } = CIRCLES[id];
    return (
      <Circle
        key={id}
        id={id}
        diameter={px(CONTROL_SIZE[id])}
        focused={on}
        label={t(label)}
        onActivate={onActivate}
        onFocus={onFocus}
      >
        {glyph(glyphState, px)}
      </Circle>
    );
  };

  return (
    <Box row align="center" gap={px(ROW_GAP)} pt={px(4)}>
      {/* The transport is centred by the two sides being the SAME width, not by
          the middle taking what is left: Yoga folds a min-width into the flex
          base, so a growing side box ends up its own minimum wider than a bare
          spacer and drags the transport half a cluster to the left. The spacer
          is the only thing that gives way, so a stage too narrow for the mirror
          costs the centring rather than overlapping the cluster. */}
      <Box w={clusterWidth} shrink={1} />
      <Box row grow={1} center gap={px(TRANSPORT_GAP)}>
        {transport.map(render)}
      </Box>
      <Box row align="center" justify="flex-end" gap={px(CLUSTER_GAP)} w={clusterWidth}>
        {cluster.map(render)}
      </Box>
    </Box>
  );
});

function VolumeControl({
  focused,
  muted,
  volume,
  px,
  onFocus,
  onToggle,
  onVolume,
  label,
  muteLabel,
}: Readonly<{
  focused: boolean;
  muted: boolean;
  volume: number;
  px: Px;
  onFocus: () => void;
  onToggle: () => void;
  onVolume: (v: number) => void;
  label: string;
  muteLabel: string;
}>) {
  const lit = useFocusVisible(focused);
  // Measured on the RAIL, not the row that holds it: the row has 20px of right
  // padding, so dividing a pointer offset by the row's width would put the level
  // a fifth past the cursor. The two share a left edge, so this still works.
  const track = useDragTrack();
  const { ref: trackRef, onLayout: onTrackLayout } = track;
  const level = muted ? 0 : volume;
  const percent = Math.round(level * 100);
  // Fill and thumb track the perceptual slider position, not raw amplitude, so
  // the handle sits under the pointer while the audio follows the loudness curve.
  const sliderPos = muted ? 0 : volumeToSlider(volume);
  const volIcon = volumeGlyph(level, px(24));

  const setAt = useEffectEvent((x: number) => {
    const offset = track.offsetOf(x);
    if (offset == null || track.width <= 0) return;
    onVolume(sliderToVolume(clamp01(offset / track.width)));
  });

  const endSelectionBlock = useRef(NOOP);
  // A drag cut short by an unmount (chrome auto-hide, route change) would
  // otherwise leave the document unselectable for the rest of the session.
  useEffect(() => () => endSelectionBlock.current(), []);

  const grabRail = useEffectEvent((x: number) => {
    endSelectionBlock.current = suppressSelection();
    track.measure();
    setAt(x);
  });
  const releaseRail = useEffectEvent(() => {
    endSelectionBlock.current();
    endSelectionBlock.current = NOOP;
  });

  // Built once: the handlers are effect events, so the one responder always
  // sees the current rail geometry without ever being recreated.
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => grabRail(e.nativeEvent.locationX),
      onPanResponderMove: (e: GestureResponderEvent) => setAt(e.nativeEvent.locationX),
      onPanResponderRelease: () => releaseRail(),
      onPanResponderTerminate: () => releaseRail(),
    }),
  );

  const size = px(CONTROL_SIZE.volume);
  const thumb = px(13);
  return (
    <Box
      row
      align="center"
      shrink={0}
      h={size}
      radius="pill"
      overflow="hidden"
      onPointerEnter={onFocus}
      style={volumePill(undefined, { focus: lit }).root}
    >
      {/* Controlled at `false`: the PILL carries the focus visuals for the whole
          control, but the button must still opt out of platform focus. */}
      <IconButton
        variant="ghost"
        diameter={size}
        focused={false}
        label={muteLabel}
        onPress={onToggle}
      >
        {volIcon}
      </IconButton>
      <View
        {...pan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        {...a11yValue({ min: 0, max: 100, now: percent, text: `${percent}%` })}
        style={{
          height: size,
          width: px(VOLUME_RAIL),
          justifyContent: 'center',
          paddingRight: px(20),
        }}
      >
        <Box
          ref={trackRef}
          onLayout={onTrackLayout}
          style={s.inert}
          h={px(6)}
          w="100%"
          radius="pill"
          bg="white/22"
        >
          {/* Fill width and thumb offset vary with volume, so they use `style`
              (bypassing the shared cache) rather than `w`/`left`, which would
              mint a cache entry per level. */}
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
            w={thumb}
            h={thumb}
            radius="pill"
            bg="#FFFFFF"
            style={[
              s.thumb,
              // Half its own size, so the handle stays centred on the level at
              // whatever scale the row is drawn.
              {
                left: `${sliderPos * 100}%`,
                transform: [{ translateX: -thumb / 2 }, { translateY: -thumb / 2 }],
              },
            ]}
          />
        </Box>
      </View>
    </Box>
  );
}

const s = styles({
  thumb: { boxShadow: '0 1px 4px rgba(0, 0, 0, 0.5)' },
  inert: { pointerEvents: 'none' },
});

const NOOP = () => {};
