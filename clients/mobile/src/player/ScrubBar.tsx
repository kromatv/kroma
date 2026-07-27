// Touch scrub bar: buffered + played fills, drag preview with a storyboard
// thumbnail + time bubble. A plain tap seeks directly; the engine decides
// native seek vs re-anchor on commit.
//
// Drawn with the TV seek bar's anatomy (the kit's SEEK_BAR constants, shared
// with @kroma/ui SeekBar): a 6pt pill track, buffer fill, the played span as
// the amber gradient, and a white playhead wearing the amber halo - always on
// screen, the way the TV's is, because the bar that says "you can seek here"
// should not need a touch to start saying it.

import { formatTimecode } from '@kroma/core';
import { SEEK_BAR } from '@kroma/ui';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colors, radius } from '#mobile/lib/theme';
import type { StoryboardTile } from './useStoryboard';

const BAR_H = 6;
const THUMB_W = 148;
/** The playhead: a white pill in the amber halo, grown a touch under a drag. */
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
  /** Chapter/marker starts (abs seconds) shown as ticks on the track. */
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
      <View
        style={styles.touch}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
      >
        {active ? (
          <View style={[styles.previewBox, { left: previewLeft - THUMB_W / 2 }]}>
            {tile ? (
              <View style={[styles.thumb, { width: THUMB_W, height: thumbH }]}>
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
              </View>
            ) : null}
            <View style={styles.bubble}>
              <Text style={styles.bubbleText}>{formatTimecode(shown)}</Text>
            </View>
          </View>
        ) : null}
        <View style={styles.track}>
          <View style={[styles.buffered, { width: `${bufFrac * 100}%` }]} />
          {/* The TV bar's played span: the amber gradient, not a flat fill. */}
          <LinearGradient
            colors={SEEK_BAR.played}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.played, { width: `${playedFrac * 100}%` }]}
          />
          {dur > 0
            ? (markers ?? [])
                .filter((m) => m > 0 && m < dur)
                .map((m) => (
                  <View key={m} style={[styles.markerTick, { left: `${(m / dur) * 100}%` }]} />
                ))
            : null}
        </View>
        <View
          style={[
            styles.knob,
            {
              width: knob,
              height: knob,
              borderRadius: knob / 2,
              left: playedFrac * width - knob / 2,
            },
          ]}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  touch: { height: 40, justifyContent: 'center' },
  track: {
    height: BAR_H,
    borderRadius: BAR_H / 2,
    backgroundColor: SEEK_BAR.track,
    overflow: 'hidden',
  },
  buffered: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SEEK_BAR.buffered,
    borderRadius: BAR_H / 2,
  },
  played: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: BAR_H / 2 },
  markerTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2.5,
    backgroundColor: 'rgba(10, 10, 12, 0.9)',
  },
  /** The TV playhead: white, in the amber halo. A border stands in for the
   * box-shadow ring, which native cannot spread. */
  knob: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: SEEK_BAR.playheadHalo,
  },
  previewBox: {
    position: 'absolute',
    bottom: 38,
    width: THUMB_W,
    alignItems: 'center',
    gap: 6,
  },
  thumb: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: '#000',
  },
  bubble: {
    borderRadius: radius.md,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  bubbleText: { color: colors.text, fontSize: 11, fontVariant: ['tabular-nums'] },
});
