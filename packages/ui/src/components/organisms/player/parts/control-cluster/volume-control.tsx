import { type StyleScope, sharedStyle, styles, sv, useStyleScope, useSv } from '#ui/core';

// The volume pill: a mute key and a drag rail in one control, which the row
// collapses to the bare key when there is no width for the rail.

import { type ReactNode, useEffect, useRef, useState } from 'react';

import { type GestureResponderEvent, PanResponder, View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Frost } from '#ui/components/atoms/frost';
import { IconButton } from '#ui/components/atoms/icon-button';
import { useDragTrack } from '#ui/components/organisms/player/hooks/use-drag-track';
import { clamp01, sliderToVolume, volumeToSlider } from '#ui/components/organisms/player/lib/fmt';
import { CONTROL_SIZE, type Px, VOLUME_RAIL } from '#ui/components/organisms/player/lib/metrics';
import { IconMute, IconVolHigh, IconVolLow } from '#ui/components/organisms/player/parts/icons';

import { useStyles } from '#ui/core/styles';
import { a11yValue } from '#ui/lib/a11y';
import { suppressSelection } from '#ui/lib/drag-select';
import { NO_OUTLINE } from '#ui/lib/field-shell';
import { useFocusVisible } from '#ui/lib/focus-visible';
import { useStableCallback } from '#ui/lib/stable-callback';
import { useFocusMirror } from '#ui/lib/use-focus-mirror';

// The volume pill's wrapper isn't a kit atom (it holds a button AND a slider),
// so its focus visuals live on the wrapper itself.
const volumePill = sv({
  base: {
    bg: 'tint/12',
    border: 'tint/20',
    _hover: { bg: 'tint/18' },
    _press: { bg: 'tint/22' },
    _focus: { bg: 'tint/22', ring: 'focusLift', z: 1 },
  },
});

const railOf = (height: number, width: number, paddingRight: number, scope: StyleScope) =>
  sharedStyle(
    `volume:rail:${height}:${width}:${paddingRight}`,
    {
      height,
      width,
      justifyContent: 'center',
      paddingRight,
    },
    scope,
  );

// Shared by the volume pill and the bare mute key a narrow row collapses to,
// so the two never disagree about what "muted" looks like.
export function volumeGlyph(level: number, size: number): ReactNode {
  if (level === 0) return <IconMute size={size} />;
  if (level < 0.5) return <IconVolLow size={size} />;
  return <IconVolHigh size={size} />;
}

export function VolumeControl({
  focused,
  muted,
  volume,
  max,
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
  max: number;
  px: Px;
  onFocus: () => void;
  onToggle: () => void;
  onVolume: (v: number) => void;
  label: string;
  muteLabel: string;
}>) {
  const volumePillScoped = useSv(volumePill);

  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  const lit = useFocusVisible(focused);
  const mirror = useFocusMirror(focused);
  // Measured on the RAIL, not the row that holds it: the row has 20px of right
  // padding, so dividing a pointer offset by the row's width would put the level
  // a fifth past the cursor. The two share a left edge, so this still works.
  const track = useDragTrack();
  const { ref: trackRef, onLayout: onTrackLayout } = track;
  const level = muted ? 0 : volume;
  const percent = Math.round(level * 100);
  // Fill and thumb track the perceptual slider position, not raw amplitude, so
  // the handle sits under the pointer while the audio follows the loudness curve.
  const sliderPos = muted ? 0 : volumeToSlider(volume, max);
  const unity = 1 / max;
  const boosted = max > 1 && sliderPos > unity;
  const volIcon = volumeGlyph(level, px(24));

  const setAt = useStableCallback((x: number) => {
    const offset = track.offsetOf(x);
    if (offset == null || track.width <= 0) return;
    onVolume(sliderToVolume(clamp01(offset / track.width), max));
  });

  const endSelectionBlock = useRef(NOOP);
  // A drag cut short by an unmount (chrome auto-hide, route change) would
  // otherwise leave the document unselectable for the rest of the session.
  useEffect(() => () => endSelectionBlock.current(), []);

  const grabRail = useStableCallback((x: number) => {
    endSelectionBlock.current = suppressSelection();
    track.measure();
    setAt(x);
  });
  const releaseRail = useStableCallback(() => {
    endSelectionBlock.current();
    endSelectionBlock.current = NOOP;
  });

  // Built once: the handlers keep one identity, so the one responder always
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
    <Frost>
      <Box
        row
        align="center"
        shrink={0}
        h={size}
        radius="pill"
        overflow="hidden"
        onPointerEnter={onFocus}
        style={volumePillScoped(undefined, { focus: lit }).root}
      >
        {/* Controlled at `false`: the PILL carries the focus visuals for the whole
          control, but the button must still opt out of platform focus. */}
        <IconButton
          variant="ghost"
          diameter={size}
          focused={false}
          style={NO_OUTLINE}
          label={muteLabel}
          onPress={onToggle}
          onFocus={onFocus}
        >
          {volIcon}
        </IconButton>
        <View
          {...pan.panHandlers}
          ref={mirror}
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          onFocus={onFocus}
          {...a11yValue({ min: 0, max: Math.round(max * 100), now: percent, text: `${percent}%` })}
          style={[railOf(size, px(VOLUME_RAIL), px(20), scope), NO_OUTLINE]}
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
            {boosted ? (
              <Box
                absolute
                top={0}
                bottom={0}
                radius="pill"
                bg="accentBright"
                style={{ left: `${unity * 100}%`, width: `${(sliderPos - unity) * 100}%` }}
              />
            ) : null}
            {max > 1 ? (
              <Box
                absolute
                top="50%"
                w={px(6)}
                h={px(6)}
                radius="circle"
                bg={boosted ? '#FFFFFF' : 'white/60'}
                style={{
                  left: `${unity * 100}%`,
                  transform: [{ translateX: -px(3) }, { translateY: -px(3) }],
                }}
              />
            ) : null}
            <Box
              absolute
              top="50%"
              w={thumb}
              h={thumb}
              radius="pill"
              bg="white"
              style={[
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
    </Frost>
  );
}

const sDefinition = styles({
  inert: { pointerEvents: 'none' },
});

const NOOP = () => {};
