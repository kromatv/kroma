// Touch scrub bar: buffered + played fills, drag preview with a storyboard
// thumbnail + time bubble, drawn from the kit's seek-bar paints so it matches
// the TV seek bar.

import { formatTimecode } from '@kroma/core';
import { seekBar } from '@kroma/ui';
import { Box, styles, Text } from '@kroma/ui/kit';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { radius } from '#mobile/lib/theme';
import type { StoryboardTile } from './useStoryboard';

const BAR_H = 6;
const THUMB_W = 148;
const KNOB = 14;
const KNOB_ACTIVE = 18;

export function ScrubBar({
  cur,
  dur,
  buffered,
  onSeek,
  tileFor,
  markers,
}: Readonly<{
  cur: number;
  dur: number;
  buffered: number;
  onSeek(abs: number): void;
  tileFor?: (abs: number) => StoryboardTile | null;
  markers?: number[];
}>) {
  const [preview, setPreview] = useState<number | null>(null);
  const [width, setWidth] = useState(1);
  const widthRef = useRef(1);
  const durRef = useRef(dur);
  durRef.current = dur;

  const toTime = (x: number) =>
    Math.max(0, Math.min(durRef.current, (x / widthRef.current) * durRef.current));

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-5, 5])
    .onBegin((e) => setPreview(toTime(e.x)))
    .onUpdate((e) => setPreview(toTime(e.x)))
    .onEnd((e) => {
      onSeek(toTime(e.x));
      setPreview(null);
    })
    .onFinalize(() => setPreview(null));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e, ok) => {
      if (ok) onSeek(toTime(e.x));
      setPreview(null);
    });
  const gesture = Gesture.Race(pan, tap);

  const paint = seekBar();
  const shown = preview ?? cur;
  const playedFrac = dur > 0 ? Math.min(1, shown / dur) : 0;
  const bufFrac = dur > 0 ? Math.min(1, buffered / dur) : 0;
  const active = preview != null;
  const knob = active ? KNOB_ACTIVE : KNOB;
  const tile = active && tileFor ? tileFor(shown) : null;
  const thumbH = tile ? Math.round((THUMB_W / tile.tileW) * tile.tileH) : 0;
  const scale = tile ? THUMB_W / tile.tileW : 1;
  const previewLeft = Math.max(THUMB_W / 2, Math.min(width - THUMB_W / 2, playedFrac * width));

  return (
    <GestureDetector gesture={gesture}>
      <Box
        style={s.touch}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
      >
        {active ? (
          <Box style={[s.previewBox, { left: previewLeft - THUMB_W / 2 }]}>
            {tile ? (
              <Box style={[s.thumb, { width: THUMB_W, height: thumbH }]}>
                <Image
                  source={{ uri: tile.sheet }}
                  contentFit="fill"
                  style={{
                    position: 'absolute',
                    left: -tile.x * scale,
                    top: -tile.y * scale,
                    width: tile.sheetW * scale,
                    height: tile.sheetH * scale,
                  }}
                />
              </Box>
            ) : null}
            <Box style={s.bubble}>
              <Text style={s.bubbleText}>{formatTimecode(shown)}</Text>
            </Box>
          </Box>
        ) : null}
        <Box style={[s.track, { backgroundColor: paint.track }]}>
          <Box
            style={[s.buffered, { backgroundColor: paint.buffered, width: `${bufFrac * 100}%` }]}
          />
          <LinearGradient
            colors={paint.played}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[s.played, { width: `${playedFrac * 100}%` }]}
          />
          {dur > 0
            ? (markers ?? [])
                .filter((m) => m > 0 && m < dur)
                .map((m) => <Box key={m} style={[s.markerTick, { left: `${(m / dur) * 100}%` }]} />)
            : null}
        </Box>
        <Box
          style={[
            s.knob,
            {
              borderColor: paint.playheadHalo,
              width: knob,
              height: knob,
              borderRadius: knob / 2,
              left: playedFrac * width - knob / 2,
            },
          ]}
        />
      </Box>
    </GestureDetector>
  );
}

const s = styles({
  touch: { justify: 'center', h: 40 },
  track: { h: BAR_H, radius: BAR_H / 2, overflow: 'hidden' },
  buffered: { absolute: true, top: 0, bottom: 0, left: 0, radius: BAR_H / 2 },
  played: { absolute: true, top: 0, bottom: 0, left: 0, radius: BAR_H / 2 },
  markerTick: { absolute: true, top: 0, bottom: 0, w: 2.5, bg: 'bg/90' },
  // The border stands in for a box-shadow ring, which native cannot spread.
  knob: { absolute: true, bg: 'white', borderWidth: 3 },
  previewBox: { absolute: true, bottom: 38, align: 'center', gap: 6, w: THUMB_W },
  thumb: { bg: 'black', radius: radius.md, border: 'borderStrong', overflow: 'hidden' },
  bubble: { px: 12, py: 4, bg: 'black/80', radius: radius.md },
  bubbleText: { color: 'text', fontSize: 11, fontVariant: ['tabular-nums'] },
});
