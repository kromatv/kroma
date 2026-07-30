import { formatTimecode } from '@kroma/core';
import { useCallback, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, PanResponder, View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { gradient } from '#ui/lib/css';
import { fonts } from '#ui/lib/tokens';
import type { StoryboardTile } from '#ui/services/storyboard';
import { useDragTrack } from '../hooks/useDragTrack';
import { clamp01 } from '../lib/fmt';
import { scaler } from '../lib/metrics';
import { msAtOffset, offsetAt, SEGMENT_GAP } from '../lib/seek-track';
import { SEEK_BAR } from '../lib/style';
import type { Chapter } from '../types';
import { StoryboardThumb } from './StoryboardThumb';

export interface SeekBarProps {
  cur: number;
  dur: number;
  bufEnd: number;
  seekPreview: number | null;
  /** Empty = one continuous segment over the whole runtime. */
  chapters: Chapter[];
  tileAt: (sec: number) => StoryboardTile | null;
  focused: boolean;
  elapsed: string;
  chapterLabel?: string;
  total: string;
  endsAt: string;
  scale?: number;
  onScrub: (sec: number) => void;
  onScrubCommit: () => void;
}

function previewCentre(centre: number, trackWidth: number, half: number): number {
  if (trackWidth <= 0) return 0;
  if (half * 2 >= trackWidth) return centre;
  return Math.max(half, Math.min(trackWidth - half, centre));
}

export function SeekBar({
  cur,
  dur,
  bufEnd,
  seekPreview,
  chapters,
  tileAt,
  focused,
  elapsed,
  chapterLabel,
  total,
  endsAt,
  scale = 1,
  onScrub,
  onScrubCommit,
}: Readonly<SeekBarProps>) {
  const px = scaler(scale);
  // Built per scale, not per tick: this bar re-renders ~4 Hz and is not memoized,
  // so a fresh array would miss the style cache four times a second.
  const s = useMemo(() => styles(scale), [scale]);
  // The track measures itself rather than reading a DOM rect, so the same drag
  // maths runs on a TV; PanResponder is the one gesture API both renderers have.
  const track = useDragTrack();
  const trackWidth = track.width;
  const dragging = useRef(false);
  const [hoverSec, setHoverSec] = useState<number | null>(null);

  const shown = seekPreview ?? cur;

  // The segments are the track's coordinate system (see lib/seek-track), so
  // everything below is measured against them rather than against `cur / dur`.
  const segs = useMemo(
    () =>
      chapters.length > 0
        ? chapters
        : [{ startMs: 0, endMs: dur * 1000, title: '', kind: 'chapter' as const }],
    [chapters, dur],
  );

  const secAt = useCallback(
    (locationX: number): number | null => {
      const offset = track.offsetOf(locationX);
      if (offset == null || dur <= 0) return null;
      return msAtOffset(offset, segs, track.width) / 1000;
    },
    [dur, segs, track.offsetOf, track.width],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          track.measure();
          const sec = secAt(e.nativeEvent.locationX);
          if (sec == null) return;
          dragging.current = true;
          onScrub(sec);
          setHoverSec(sec);
        },
        onPanResponderMove: (e: GestureResponderEvent) => {
          if (!dragging.current) return;
          const sec = secAt(e.nativeEvent.locationX);
          if (sec == null) return;
          onScrub(sec);
          setHoverSec(sec);
        },
        onPanResponderRelease: () => {
          if (!dragging.current) return;
          dragging.current = false;
          setHoverSec(null);
          onScrubCommit();
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          setHoverSec(null);
        },
      }),
    [track.measure, secAt, onScrub, onScrubCommit],
  );

  const shownMs = shown * 1000;
  const bufMs = bufEnd * 1000;
  const playheadX = offsetAt(shownMs, segs, trackWidth);

  let previewSec: number | null = null;
  if (hoverSec != null) previewSec = hoverSec;
  else if (focused) previewSec = shown;
  const previewTile = previewSec != null ? tileAt(previewSec) : null;
  // Centred on the cursor, but kept inside the track: at 0:00 half the thumbnail
  // would otherwise hang off the edge of the screen.
  const previewHalf = (previewTile?.width ?? 0) / 2;
  const previewX =
    previewSec == null
      ? 0
      : previewCentre(offsetAt(previewSec * 1000, segs, trackWidth), trackWidth, previewHalf);

  return (
    <Box mb={px(20)}>
      {/* The chapter title is the one string of unbounded length here, so it
          shrinks and truncates rather than growing into the runtime. */}
      <Box row align="baseline" between gap={px(12)} mb={px(13)}>
        <Txt lines={1} style={s.timeShrink}>
          {elapsed}
          {chapterLabel ? (
            <Txt style={s.timeMuted} color="rgba(244, 243, 240, 0.5)">{` · ${chapterLabel}`}</Txt>
          ) : null}
        </Txt>
        <Txt lines={1} style={s.time} color="rgba(244, 243, 240, 0.5)">
          {total}
          {endsAt ? (
            <Txt style={s.timeMuted} color="rgba(244, 243, 240, 0.38)">{` · ${endsAt}`}</Txt>
          ) : null}
        </Txt>
      </Box>

      {/* track */}
      <Box
        row
        align="center"
        gap={px(4)}
        h={px(18)}
        px={px(2)}
        radius="pill"
        accessibilityRole="adjustable"
        accessibilityLabel="progress"
        accessibilityValue={{ min: 0, max: Math.round(dur), now: Math.round(shown) }}
        style={focused ? FOCUSED_TRACK : null}
      >
        {/* The varying offset rides the transform via `style`, never a shorthand
            prop: a shorthand mints a permanent sharedBoxStyle entry per pixel. */}
        {previewSec != null ? (
          <Box
            absolute
            bottom={px(36)}
            left={0}
            z={6}
            align="center"
            gap={px(8)}
            pointerEvents="none"
            style={{ transform: [{ translateX: previewX - previewHalf }] }}
          >
            {previewTile ? <StoryboardThumb tile={previewTile} /> : null}
            <Box radius="md" bg="rgba(0, 0, 0, 0.8)" px={px(12)} py={px(4)}>
              <Txt style={s.stamp}>{formatTimecode(previewSec)}</Txt>
            </Box>
          </Box>
        ) : null}

        {/* segmented track */}
        <View ref={track.ref} onLayout={track.onLayout} {...pan.panHandlers} style={s.track}>
          {segs.map((seg) => {
            const span = Math.max(1, seg.endMs - seg.startMs);
            const played = clamp01((shownMs - seg.startMs) / span);
            const buffed = clamp01((bufMs - seg.startMs) / span);
            return (
              // `flex={span}`: a segment is as wide as its chapter is long, so the
              // playhead agrees with its fill. `h="100%"` mints one shared style,
              // not one per chapter per scale.
              <Box
                key={seg.startMs}
                flex={span}
                h="100%"
                radius="pill"
                overflow="hidden"
                bg={SEEK_BAR.track}
                pointerEvents="none"
              >
                {/* Insets vary per tick, so they bypass the shared cache via `style`.
                    Not scaleX: that would stretch the gradient and the pill caps. */}
                <Box
                  fill
                  radius="pill"
                  bg={SEEK_BAR.buffered}
                  style={{ right: `${(1 - buffed) * 100}%` }}
                />
                <Box
                  fill
                  radius="pill"
                  style={[PLAYED_FILL, { right: `${(1 - played) * 100}%` }]}
                />
              </Box>
            );
          })}

          {/* The offset is folded into the transform so a tick only moves a
              composited layer. */}
          <Box
            absolute
            top="50%"
            left={0}
            w={px(16)}
            h={px(16)}
            radius="pill"
            bg="#FFFFFF"
            pointerEvents="none"
            style={[
              PLAYHEAD,
              {
                transform: [{ translateX: playheadX - px(16) / 2 }, { translateY: -px(16) / 2 }],
              },
            ]}
          />
        </View>
      </Box>
    </Box>
  );
}

const TIME_SIZE = 18;
const STAMP_SIZE = 14;
const TRACK_HEIGHT = 6;

const TIME = {
  fontFamily: fonts.ui,
  fontWeight: '600' as const,
  color: '#F4F3F0',
  fontVariant: ['tabular-nums' as const],
};
const MUTED = { fontWeight: '500' as const };
const SHRINK = { flexShrink: 1 };
const FOCUSED_TRACK = { boxShadow: '0 0 0 4px rgba(242, 180, 66, 0.28)' };
const TRACK = {
  position: 'relative' as const,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  flex: 1,
  gap: SEGMENT_GAP,
};
const PLAYED_FILL = gradient(
  `linear-gradient(90deg, ${SEEK_BAR.played[0]}, ${SEEK_BAR.played[1]})`,
);
const PLAYHEAD = {
  boxShadow: `0 0 0 4px ${SEEK_BAR.playheadHalo}, 0 2px 8px rgba(0, 0, 0, 0.6)`,
};
const STAMP = {
  fontFamily: fonts.ui,
  fontWeight: '700' as const,
  color: '#FFFFFF',
  fontVariant: ['tabular-nums' as const],
};

function styles(scale: number) {
  const px = scaler(scale);
  const time = { fontSize: px(TIME_SIZE) };
  return {
    time: [TIME, time],
    timeMuted: [TIME, time, MUTED],
    timeShrink: [TIME, time, SHRINK],
    stamp: [STAMP, { fontSize: px(STAMP_SIZE) }],
    track: [TRACK, { height: px(TRACK_HEIGHT) }],
  };
}
