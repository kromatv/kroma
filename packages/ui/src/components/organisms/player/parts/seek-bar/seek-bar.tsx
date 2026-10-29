import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, PanResponder, type PointerEvent, View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Text } from '#ui/components/atoms/text';
import { useDragTrack } from '#ui/components/organisms/player/hooks/use-drag-track';
import { clamp01 } from '#ui/components/organisms/player/lib/fmt';
import { scaler } from '#ui/components/organisms/player/lib/metrics';
import { msAtOffset, offsetAt, SEGMENT_GAP } from '#ui/components/organisms/player/lib/seek-track';
import { seekBar } from '#ui/components/organisms/player/lib/style';
import { StoryboardThumb } from '#ui/components/organisms/player/parts/storyboard-thumb';
import type { Chapter } from '#ui/components/organisms/player/types';
import {
  resolveStyles,
  type StyleScope,
  sharedStyle,
  style,
  styles,
  sv,
  themed,
  useStyleScope,
  useSv,
} from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { gradient } from '#ui/lib/css';
import { suppressSelection } from '#ui/lib/drag-select';
import { usePointerDriving } from '#ui/lib/input-source';
import { formatTimecode } from '#ui/lib/intl';
import { useT } from '#ui/services/i18n';
import type { StoryboardTile } from '#ui/services/storyboard';
import { seekBarPaint } from '../../lib/style';

const seekTrack = sv({ base: { _focus: { ring: 'focusWash' } } });

export interface SeekBarProps {
  cur: number;
  dur: number;
  /** How far ahead the backend holds, in absolute seconds. `null` when it has
   *  none to report, and then the track carries no buffered fill at all. */
  bufEnd: number | null;
  seekPreview: number | null;
  /** Empty = one continuous segment over the whole runtime. */
  chapters: Chapter[];
  tileAt: (sec: number) => StoryboardTile | null;
  elapsed: string;
  chapterLabel?: string;
  total: string;
  endsAt: string;
  scale?: number;
  onScrub: (sec: number) => void;
  onScrubCommit: () => void;
  /** OK on the focused bar. */
  onActivate: () => void;
  /** Left or Right on the focused bar: a step back or forward through the film. */
  onNudge: (dir: -1 | 1) => void;
  onFocus: () => void;
  onBlur: () => void;
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
  elapsed,
  chapterLabel,
  total,
  endsAt,
  scale = 1,
  onScrub,
  onScrubCommit,
  onActivate,
  onNudge,
  onFocus,
  onBlur,
}: Readonly<SeekBarProps>) {
  const seekTrackScoped = useSv(seekTrack);

  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  const t = useT();
  const [focused, setFocused] = useState(false);
  const px = scaler(scale);
  // Built per scale, not per tick: this bar re-renders ~4 Hz and is not memoized,
  // so a fresh array would miss the style cache four times a second.
  const sized = useMemo(() => scaled(scale, scope), [scale, scope]);
  // The track measures itself rather than reading a DOM rect, so the same drag
  // maths runs on a TV; PanResponder is the one gesture API both renderers have.
  const track = useDragTrack();
  const { ref: trackRef, onLayout: onTrackLayout } = track;
  const trackWidth = track.width;
  const dragging = useRef(false);
  const [hoverSec, setHoverSec] = useState<number | null>(null);
  const pointerDriving = usePointerDriving();

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

  const secAtOffset = (offset: number | null): number | null => {
    if (offset == null || dur <= 0 || track.width <= 0) return null;
    return msAtOffset(Math.max(0, Math.min(track.width, offset)), segs, track.width) / 1000;
  };
  const secAt = (locationX: number): number | null => secAtOffset(track.offsetOf(locationX));

  const hover = (e: PointerEvent) => {
    if (dragging.current) return;
    setHoverSec(secAtOffset(track.offsetAtClient(e.nativeEvent.clientX)));
  };
  const leave = () => {
    if (!dragging.current) setHoverSec(null);
  };

  const endSelectionBlock = useRef(NOOP);
  // A drag cut short by an unmount (chrome auto-hide, route change) would
  // otherwise leave the document unselectable for the rest of the session.
  useEffect(() => () => endSelectionBlock.current(), []);

  const grabScrub = useEffectEvent((locationX: number) => {
    endSelectionBlock.current = suppressSelection();
    track.measure();
    const sec = secAt(locationX);
    if (sec == null) return;
    dragging.current = true;
    onScrub(sec);
    setHoverSec(sec);
  });
  const moveScrub = useEffectEvent((locationX: number) => {
    if (!dragging.current) return;
    const sec = secAt(locationX);
    if (sec == null) return;
    onScrub(sec);
    setHoverSec(sec);
  });
  const releaseScrub = useEffectEvent(() => {
    endSelectionBlock.current();
    endSelectionBlock.current = NOOP;
    if (!dragging.current) return;
    dragging.current = false;
    setHoverSec(null);
    onScrubCommit();
  });
  const cancelScrub = useEffectEvent(() => {
    endSelectionBlock.current();
    endSelectionBlock.current = NOOP;
    dragging.current = false;
    setHoverSec(null);
  });

  // Built once: the handlers are effect events, so the one responder always
  // sees the current track and callbacks without ever being recreated.
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => grabScrub(e.nativeEvent.locationX),
      onPanResponderMove: (e: GestureResponderEvent) => moveScrub(e.nativeEvent.locationX),
      onPanResponderRelease: () => releaseScrub(),
      onPanResponderTerminate: () => cancelScrub(),
    }),
  );

  const shownMs = shown * 1000;
  const bufMs = bufEnd == null ? null : bufEnd * 1000;
  const playheadX = offsetAt(shownMs, segs, trackWidth);

  let previewSec: number | null = null;
  if (hoverSec != null) previewSec = hoverSec;
  else if (focused && !pointerDriving()) previewSec = shown;
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
      <Focusable
        ring={false}
        // oxlint-disable-next-line jsx-a11y/aria-role -- React Native's vocabulary, not ARIA's - react-native-web renders `adjustable` as the ARIA `slider`.
        role="adjustable"
        label={t('player.seekBar')}
        value={{ min: 0, max: Math.round(dur), now: Math.round(shown), text: elapsed }}
        onPress={onActivate}
        onFocus={() => {
          setFocused(true);
          onFocus();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur();
        }}
        onKey={(direction) => {
          if (direction !== 'left' && direction !== 'right') return false;
          onNudge(direction === 'left' ? -1 : 1);
          return true;
        }}
        style={[
          s.bar,
          { gap: px(4), height: px(18), paddingHorizontal: px(2) },
          seekTrackScoped(undefined, { focus: focused }).root,
        ]}
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
            <Box radius="sm" bg="black/80" px={px(12)} py={px(4)}>
              <Text style={sized.stamp}>{formatTimecode(previewSec)}</Text>
            </Box>
          </Box>
        ) : null}

        {/* segmented track */}
        <View
          {...pan.panHandlers}
          onPointerEnter={track.measure}
          onPointerMove={hover}
          onPointerLeave={leave}
          style={s.hit}
        >
          <View ref={trackRef} onLayout={onTrackLayout} style={[sized.track, s.inert]}>
            {segs.map((seg) => {
              const span = Math.max(1, seg.endMs - seg.startMs);
              const played = clamp01((shownMs - seg.startMs) / span);
              const buffed = bufMs == null ? null : clamp01((bufMs - seg.startMs) / span);
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
                  bg={seekBar(scope.theme).track}
                  style={s.inert}
                >
                  {/* Insets vary per tick, so they bypass the shared cache via `style`.
                    Not scaleX: that would stretch the gradient and the pill caps. */}
                  {buffed == null ? null : (
                    <Box
                      fill
                      radius="pill"
                      bg={seekBar(scope.theme).buffered}
                      style={{ right: `${(1 - buffed) * 100}%` }}
                    />
                  )}
                  <Box
                    fill
                    radius="pill"
                    style={[playedFill(scope.theme), { right: `${(1 - played) * 100}%` }]}
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
              bg="white"
              style={[
                s.inert,
                playheadRing(scope.theme),
                {
                  transform: [{ translateX: playheadX - px(16) / 2 }, { translateY: -px(16) / 2 }],
                },
              ]}
            />
          </View>
        </View>
      </Focusable>
    </Box>
  );
}

const TIME_SIZE = 18;
const STAMP_SIZE = 14;
const TRACK_HEIGHT = 6;
const HIT_PAD = 14;

const playedFill = themed((theme) =>
  style(
    gradient(
      `linear-gradient(90deg, ${seekBarPaint(theme).played[0]}, ${seekBarPaint(theme).played[1]})`,
    ),
  ),
);

const playheadRing = themed((theme) =>
  style({ boxShadow: `0 0 0 4px ${seekBarPaint(theme).playheadHalo}` }),
);

const sDefinition = styles({
  time: { font: 'ui', fontWeight: '600', color: 'text', fontVariant: ['tabular-nums'] },
  muted: { fontWeight: '500' },
  shrink: { shrink: 1 },
  track: { position: 'relative', row: true, align: 'center', gap: SEGMENT_GAP },
  stamp: { font: 'ui', fontWeight: '700', color: 'white', fontVariant: ['tabular-nums'] },
  inert: { pointerEvents: 'none' },
  bar: { row: true, align: 'center', radius: 'pill' },
  hit: { flex: true, py: HIT_PAD, my: -HIT_PAD },
});

function scaled(scale: number, scope: StyleScope) {
  const px = scaler(scale);
  const time = sharedStyle(`seek:time:${scale}`, { fontSize: px(TIME_SIZE) }, scope);
  return {
    time: [resolveStyles(sDefinition, scope).time, time],
    timeMuted: [
      resolveStyles(sDefinition, scope).time,
      time,
      resolveStyles(sDefinition, scope).muted,
    ],
    timeShrink: [
      resolveStyles(sDefinition, scope).time,
      time,
      resolveStyles(sDefinition, scope).shrink,
    ],
    stamp: [
      resolveStyles(sDefinition, scope).stamp,
      sharedStyle(`seek:stamp:${scale}`, { fontSize: px(STAMP_SIZE) }, scope),
    ],
    track: [
      resolveStyles(sDefinition, scope).track,
      sharedStyle(`seek:track:${scale}`, { height: px(TRACK_HEIGHT) }, scope),
    ],
  };
}

const NOOP = () => {};
