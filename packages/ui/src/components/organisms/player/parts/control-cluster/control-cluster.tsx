import { memo, useMemo } from 'react';
import { Box } from '#ui/components/atoms/box';
import { IconButton } from '#ui/components/atoms/icon-button';
import {
  type ChromeMetrics,
  CLUSTER_GAP,
  CONTROL_SIZE,
  isTransport,
  ROW_GAP,
  scaler,
  TRANSPORT_GAP,
} from '#ui/components/organisms/player/lib/metrics';
import type { ControlId } from '#ui/components/organisms/player/lib/nav';
import { IconPause, IconPlay } from '#ui/components/organisms/player/parts/icons';
import { sv, useSv } from '#ui/core';
import { NO_OUTLINE } from '#ui/lib/field-shell';
import { useFocusVisible } from '#ui/lib/focus-visible';
import { useT } from '#ui/services/i18n';
import { Circle, CircleControl } from './circle-control';
import { VolumeControl, volumeGlyph } from './volume-control';

const playFill = sv({ base: { _focus: { bg: 'accentHover' } } });

export interface ControlClusterProps {
  focused: ControlId | null;
  playing: boolean;
  muted: boolean;
  volume: number;
  /** The loudest the rail reaches. Above 1 the last quarter is a boost zone
   *  past a notch at 100%. Defaults to 1. */
  volumeMax?: number;
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
  volumeMax = 1,
  pipActive,
  fullscreen,
  metrics,
  onActivate,
  onFocus,
  onVolume,
}: Readonly<ControlClusterProps>) {
  const playFillScoped = useSv(playFill);

  const t = useT();
  const { scale, controls, rail, clusterWidth } = metrics;
  const px = scaler(scale);
  const transport = controls.filter(isTransport);
  const cluster = controls.filter((c) => !isTransport(c));

  // Keyed on WHICH control holds the focus: the selection moves within the
  // cluster, so the modality has to be re-read on every move.
  const lit = useFocusVisible(focused);
  const playDress = useMemo(
    () => [playFillScoped(undefined, { focus: lit && focused === 'play' }).root, NO_OUTLINE],
    [lit, focused, playFillScoped],
  );

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
          style={playDress}
          label={playing ? t('player.pause') : t('player.play')}
          onPress={() => onActivate(id)}
          onHoverIn={() => onFocus(id)}
          onFocus={() => onFocus(id)}
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
          max={volumeMax}
          px={px}
          onFocus={() => onFocus(id)}
          onToggle={() => onActivate(id)}
          onVolume={onVolume}
          label={t('player.volume')}
          muteLabel={t('player.mute')}
        />
      );
    }
    return (
      <CircleControl
        key={id}
        id={id}
        focused={on}
        scale={scale}
        pipActive={pipActive}
        fullscreen={fullscreen}
        onActivate={onActivate}
        onFocus={onFocus}
      />
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
