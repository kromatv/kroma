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
import { msAtOffset, offsetAt, SEGMENT_GAP } from '../lib/seek-track';
import { SEEK_BAR } from '../lib/style';
import type { Chapter } from '../types';
import { StoryboardThumb } from './StoryboardThumb';

export interface SeekBarProps {
  cur: number;
  dur: number;
  bufEnd: number;
  /** Pending scrub target while dragging / D-pad seeking (null when settled). */
  seekPreview: number | null;
  /** Normalized chapters; empty = one continuous segment (graceful fallback). */
  chapters: Chapter[];
  /** Storyboard thumbnail at a position (null until the sheet is ready). */
  tileAt: (sec: number) => StoryboardTile | null;
  /** The progress zone is the active D-pad focus (ring + always preview). */
  focused: boolean;
  /** Left label: elapsed time. */
  elapsed: string;
  /** Current chapter title, shown next to the elapsed time (empty to hide). */
  chapterLabel?: string;
  /** Right labels: total runtime + real end clock ("fin à 22h38"). */
  total: string;
  endsAt: string;
  /** Live scrub preview (absolute seconds) while dragging. */
  onScrub: (sec: number) => void;
  onScrubCommit: () => void;
}

/**
 * The chapter-aware progress bar (§1, §2), matching the 10-foot design: an info
 * row (elapsed . current-chapter on the left, runtime . end-clock on the right)
 * above a track of distinct chapter segments, each with its own amber played
 * fill + lighter buffered zone, a playhead pill, and the storyboard preview that
 * follows the cursor (mouse) or the position (D-pad). Pointer down-drag-up
 * previews then commits one seek click-to-point is the zero-length drag.
 */
/** Where the scrub preview's centre sits: over the moment it is previewing,
 * clamped so the whole thumbnail stays within the track. */
function previewCentre(centre: number, trackWidth: number, half: number): number {
  if (trackWidth <= 0) return 0;
  if (half * 2 >= trackWidth) return centre; // nothing to clamp into
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
  onScrub,
  onScrubCommit,
}: Readonly<SeekBarProps>) {
  // The track measures itself rather than reading a DOM rect, so the same drag
  // maths runs on a TV. React Native's responder system (through PanResponder)
  // is the one gesture API both renderers implement; `useDragTrack` is what
  // reconciles the pointer's units with the scaled canvas the bar is drawn on.
  const track = useDragTrack();
  const trackWidth = track.width;
  const dragging = useRef(false);
  const [hoverSec, setHoverSec] = useState<number | null>(null);

  const shown = seekPreview ?? cur;

  // Segments: real chapters, or a single implicit chapter over the whole runtime.
  // They are the track's coordinate system - see lib/seek-track - so everything
  // below is measured against them rather than against `cur / dur`.
  const segs = useMemo(
    () =>
      chapters.length > 0
        ? chapters
        : [{ startMs: 0, endMs: dur * 1000, title: '', kind: 'chapter' as const }],
    [chapters, dur],
  );

  /** The moment under a press, from its offset along the track. */
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
  // The playhead rides the same geometry as the fills beneath it, so it always
  // sits exactly where the amber stops.
  const playheadX = offsetAt(shownMs, segs, trackWidth);

  // Preview follows the cursor on hover, else the position while focused (D-pad).
  let previewSec: number | null = null;
  if (hoverSec != null) previewSec = hoverSec;
  else if (focused) previewSec = shown;
  const previewTile = previewSec != null ? tileAt(previewSec) : null;
  // Centred on the cursor, but kept inside the track: at 0:00 half the thumbnail
  // would hang off the left edge of the screen (and the last frames off the
  // right), which is exactly where a resume point or the credits put you.
  const previewHalf = (previewTile?.width ?? 0) / 2;
  const previewX =
    previewSec == null
      ? 0
      : previewCentre(offsetAt(previewSec * 1000, segs, trackWidth), trackWidth, previewHalf);

  return (
    <Box mb={20}>
      {/* info row */}
      <Box row align="baseline" between mb={13}>
        <Txt style={TIME}>
          {elapsed}
          {chapterLabel ? (
            <Txt style={[TIME, MUTED]} color="rgba(244, 243, 240, 0.5)">{` · ${chapterLabel}`}</Txt>
          ) : null}
        </Txt>
        <Txt style={TIME} color="rgba(244, 243, 240, 0.5)">
          {total}
          {endsAt ? (
            <Txt style={[TIME, MUTED]} color="rgba(244, 243, 240, 0.38)">{` · ${endsAt}`}</Txt>
          ) : null}
        </Txt>
      </Box>

      {/* track */}
      <Box
        row
        align="center"
        gap={4}
        h={18}
        px={2}
        radius="pill"
        accessibilityRole="adjustable"
        accessibilityLabel="progress"
        accessibilityValue={{ min: 0, max: Math.round(dur), now: Math.round(shown) }}
        style={focused ? FOCUSED_TRACK : null}
      >
        {/* storyboard preview + timestamp. The continuously-varying offset rides
            the transform (via `style`, never a shorthand prop): a shorthand
            would mint a permanent sharedBoxStyle cache entry per pixel. */}
        {previewSec != null ? (
          <Box
            absolute
            bottom={36}
            left={0}
            z={6}
            align="center"
            gap={8}
            pointerEvents="none"
            style={{ transform: [{ translateX: previewX - previewHalf }] }}
          >
            {previewTile ? <StoryboardThumb tile={previewTile} /> : null}
            <Box radius="md" bg="rgba(0, 0, 0, 0.8)" px={12} py={4}>
              <Txt style={STAMP}>{formatTimecode(previewSec)}</Txt>
            </Box>
          </Box>
        ) : null}

        {/* segmented track */}
        <View ref={track.ref} onLayout={track.onLayout} {...pan.panHandlers} style={TRACK}>
          {segs.map((seg) => {
            const span = Math.max(1, seg.endMs - seg.startMs);
            const played = clamp01((shownMs - seg.startMs) / span);
            const buffed = clamp01((bufMs - seg.startMs) / span);
            return (
              // `flex={span}`: a segment is as wide as its chapter is long. Equal
              // widths would draw a 96-second cold open the size of a 53-minute
              // act, and then no playhead could agree with its own fill.
              <Box
                key={seg.startMs}
                flex={span}
                h={6}
                radius="pill"
                overflow="hidden"
                bg={SEEK_BAR.track}
                pointerEvents="none"
              >
                {/* Fill insets vary per tick, so they go through `style` (which
                    bypasses the shared cache) rather than the `right` shorthand.
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

          {/* playhead pill: the varying offset is folded into the transform, so
              a tick only moves a composited layer (and never touches the shared
              style cache). */}
          <Box
            absolute
            top="50%"
            left={0}
            w={16}
            h={16}
            radius="pill"
            bg="#FFFFFF"
            pointerEvents="none"
            style={[PLAYHEAD, { transform: [{ translateX: playheadX - 8 }, { translateY: -8 }] }]}
          />
        </View>
      </Box>
    </Box>
  );
}

const TIME = {
  fontFamily: fonts.ui,
  fontSize: 18,
  fontWeight: '600' as const,
  color: '#F4F3F0',
  fontVariant: ['tabular-nums' as const],
};
const MUTED = { fontWeight: '500' as const };
const FOCUSED_TRACK = { boxShadow: '0 0 0 4px rgba(242, 180, 66, 0.28)' };
const TRACK = {
  position: 'relative' as const,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  height: 6,
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
  fontSize: 14,
  fontWeight: '700' as const,
  color: '#FFFFFF',
  fontVariant: ['tabular-nums' as const],
};
