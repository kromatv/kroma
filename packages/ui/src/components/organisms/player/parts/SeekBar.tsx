import { formatTimecode } from '@kroma/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, PanResponder, View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles, sv, themed } from '#ui/core';
import { gradient } from '#ui/lib/css';
import { suppressSelection } from '#ui/lib/drag-select';
import type { StoryboardTile } from '#ui/services/storyboard';
import { useDragTrack } from '../hooks/useDragTrack';
import { clamp01 } from '../lib/fmt';
import { scaler } from '../lib/metrics';
import { msAtOffset, offsetAt, SEGMENT_GAP } from '../lib/seek-track';
import { seekBar } from '../lib/style';
import type { Chapter } from '../types';
import { StoryboardThumb } from './StoryboardThumb';

const seekTrack = sv({ base: { _focus: { ring: 'focusWash' } } });

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
  const sized = useMemo(() => scaled(scale), [scale]);
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

  const endSelectionBlock = useRef(NOOP);
  // A drag cut short by an unmount (chrome auto-hide, route change) would
  // otherwise leave the document unselectable for the rest of the session.
  useEffect(() => () => endSelectionBlock.current(), []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          endSelectionBlock.current = suppressSelection();
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
          endSelectionBlock.current();
          endSelectionBlock.current = NOOP;
          if (!dragging.current) return;
          dragging.current = false;
          setHoverSec(null);
          onScrubCommit();
        },
        onPanResponderTerminate: () => {
          endSelectionBlock.current();
          endSelectionBlock.current = NOOP;
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
        <Text lines={1} style={sized.timeShrink}>
          {elapsed}
          {chapterLabel ? (
            <Text style={sized.timeMuted} color="text/50">{` · ${chapterLabel}`}</Text>
          ) : null}
        </Text>
        <Text lines={1} style={sized.time} color="text/50">
          {total}
          {endsAt ? <Text style={sized.timeMuted} color="text/38">{` · ${endsAt}`}</Text> : null}
        </Text>
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
        style={seekTrack(undefined, { focus: focused }).root}
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
            style={[s.inert, { transform: [{ translateX: previewX - previewHalf }] }]}
          >
            {previewTile ? <StoryboardThumb tile={previewTile} /> : null}
            <Box radius="md" bg="black/80" px={px(12)} py={px(4)}>
              <Text style={sized.stamp}>{formatTimecode(previewSec)}</Text>
            </Box>
          </Box>
        ) : null}

        {/* segmented track */}
        <View ref={track.ref} onLayout={track.onLayout} {...pan.panHandlers} style={sized.track}>
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
                bg={seekBar().track}
                style={s.inert}
              >
                {/* Insets vary per tick, so they bypass the shared cache via `style`.
                    Not scaleX: that would stretch the gradient and the pill caps. */}
                <Box
                  fill
                  radius="pill"
                  bg={seekBar().buffered}
                  style={{ right: `${(1 - buffed) * 100}%` }}
                />
                <Box
                  fill
                  radius="pill"
                  style={[playedFill(), { right: `${(1 - played) * 100}%` }]}
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
            radius="circle"
            bg="#FFFFFF"
            style={[
              s.inert,
              playheadShadow(),
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

const playedFill = themed(() =>
  gradient(`linear-gradient(90deg, ${seekBar().played[0]}, ${seekBar().played[1]})`),
);

const playheadShadow = themed(() => ({
  boxShadow: `0 0 0 4px ${seekBar().playheadHalo}, 0 2px 8px rgba(0, 0, 0, 0.6)`,
}));

const s = styles({
  time: { font: 'ui', fontWeight: '600', color: 'text', fontVariant: ['tabular-nums'] },
  muted: { fontWeight: '500' },
  shrink: { shrink: 1 },
  track: { position: 'relative', row: true, align: 'center', flex: true, gap: SEGMENT_GAP },
  stamp: { font: 'ui', fontWeight: '700', color: 'white', fontVariant: ['tabular-nums'] },
  inert: { pointerEvents: 'none' },
});

function scaled(scale: number) {
  const px = scaler(scale);
  const time = { fontSize: px(TIME_SIZE) };
  return {
    time: [s.time, time],
    timeMuted: [s.time, time, s.muted],
    timeShrink: [s.time, time, s.shrink],
    stamp: [s.stamp, { fontSize: px(STAMP_SIZE) }],
    track: [s.track, { height: px(TRACK_HEIGHT) }],
  };
}

const NOOP = () => {};
