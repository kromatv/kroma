import { memo } from 'react';
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
import { styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { NO_OUTLINE } from '#ui/lib/field-shell';
import { FocusRegion } from '#ui/lib/focus-scope';
import { useT } from '#ui/services/i18n';
import { Circle, CircleControl } from './circle-control';
import { VolumeControl, volumeGlyph } from './volume-control';

const PLAY_FOCUS = { focus: { bg: 'accentHover' } } as const;

export interface ControlClusterProps {
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
  /** The navigator's focus landed on a control. */
  onFocus: (id: ControlId) => void;
  /** The navigator's focus left a control. */
  onBlur: (id: ControlId) => void;
  onVolume: (v: number) => void;
  /** Up or Down on the focused volume pill. */
  onVolumeNudge: (dir: -1 | 1) => void;
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
  playing,
  muted,
  volume,
  volumeMax = 1,
  pipActive,
  fullscreen,
  metrics,
  onActivate,
  onFocus,
  onBlur,
  onVolume,
  onVolumeNudge,
}: Readonly<ControlClusterProps>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const { scale, controls, rail, clusterWidth } = metrics;
  const px = scaler(scale);
  const transport = controls.filter(isTransport);
  const cluster = controls.filter((c) => !isTransport(c));

  const render = (id: ControlId) => {
    // The two controls that are not a plain circle: play carries the accent fill
    // and its own play/pause glyph, volume owns a slider.
    if (id === 'play') {
      return (
        <IconButton
          key={id}
          variant="primary"
          diameter={px(CONTROL_SIZE.play)}
          autoFocus
          style={NO_OUTLINE}
          states={PLAY_FOCUS}
          label={playing ? t('player.pause') : t('player.play')}
          onPress={() => onActivate(id)}
          onFocus={() => onFocus(id)}
          onBlur={() => onBlur(id)}
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
            label={t('player.mute')}
            onActivate={onActivate}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            {volumeGlyph(muted ? 0 : volume, px(24))}
          </Circle>
        );
      }
      return (
        <VolumeControl
          key={id}
          muted={muted}
          volume={volume}
          max={volumeMax}
          px={px}
          onFocus={() => onFocus(id)}
          onBlur={() => onBlur(id)}
          onToggle={() => onActivate(id)}
          onVolume={onVolume}
          onNudge={onVolumeNudge}
          label={t('player.volume')}
          muteLabel={t('player.mute')}
        />
      );
    }
    return (
      <CircleControl
        key={id}
        id={id}
        scale={scale}
        pipActive={pipActive}
        fullscreen={fullscreen}
        onActivate={onActivate}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  };

  return (
    <FocusRegion style={[s.row, { gap: px(ROW_GAP), paddingTop: px(4) }]}>
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
    </FocusRegion>
  );
});

const sDefinition = styles({
  row: { row: true, align: 'center' },
});
