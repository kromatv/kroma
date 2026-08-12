// Pure presentation over the Engine; all playback logic lives in engine/.

import { audioTracksOf, type MediaItem } from '@kroma/core';
import {
  audioFilterLabels,
  buildLeanStats,
  type PlayerStats,
  StatsPanel,
  type SubtitleAppearance,
} from '@kroma/ui';
import { Box, styles, Text } from '@kroma/ui/kit';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { ControlsLayer } from './chrome/ControlsLayer';
import { BufferingSpinner, CueLine, SkipIntroButton, UpNextCard } from './chrome/overlays';
import type { Engine } from './engine';
import type { SheetView } from './TrackSheet';
import type { StoryboardTile } from './useStoryboard';

const HIDE_AFTER_MS = 4000;

function usePhoneStats(engine: Engine, item: MediaItem): () => PlayerStats {
  const t = useT();
  const filterLabels = audioFilterLabels(t);
  let sourceMode = 'HLS';
  if (engine.offline) sourceMode = 'Direct · local';
  else if (engine.mode === 'direct') sourceMode = 'Direct';

  // AVPlayer exposes no network counters to JS, so download speed is estimated
  // from the buffered edge advancing, smoothed, with a seek's jump clamped.
  const net = useRef({ at: 0, bufEnd: 0, ema: 0 });
  const file = item.files.find((f) => f.id === item.defaultFileId) ?? item.files[0];
  const avgBytesPerSec =
    file?.size && item.durationMs ? file.size / (item.durationMs / 1000) : null;
  const bandwidthMbps = (): number | null => {
    if (engine.offline || avgBytesPerSec == null) return null;
    const now = Date.now();
    const prev = net.current;
    if (prev.at === 0) {
      net.current = { at: now, bufEnd: engine.buffered, ema: 0 };
      return 0;
    }
    const dt = (now - prev.at) / 1000;
    if (dt < 0.2) return prev.ema;
    const gained = Math.min(Math.max(0, engine.buffered - prev.bufEnd), dt * 50);
    const inst = ((gained / dt) * avgBytesPerSec * 8) / 1e6;
    const ema = prev.ema === 0 ? inst : prev.ema * 0.6 + inst * 0.4;
    net.current = { at: now, bufEnd: engine.buffered, ema };
    return ema;
  };

  return () => {
    const mbps = bandwidthMbps();
    return buildLeanStats({
      item,
      cur: engine.cur,
      dur: engine.dur,
      bufEnd: engine.buffered,
      audioTracks: engine.offline ? [] : audioTracksOf(item),
      audioIndex: engine.audioIndex,
      video: null,
      mode: sourceMode,
      t,
      meters:
        mbps == null
          ? undefined
          : [
              {
                key: 'bandwidth',
                label: t('stats.bandwidth'),
                value: mbps,
                display: `${mbps.toFixed(2)} Mb/s`,
              },
            ],
      extra: [
        {
          label: t('stats.speed'),
          value: engine.rate === 1 ? t('player.normalSpeed') : `${engine.rate}×`,
          group: t('stats.playback'),
        },
        ...(engine.offline
          ? []
          : [
              {
                label: t('player.audioFilters'),
                value: filterLabels[engine.filter],
                group: t('stats.playback'),
              },
            ]),
      ],
    });
  };
}

export function PlayerChrome({
  engine,
  item,
  cue,
  appearance,
  statsOn,
  onToggleStats,
  fill,
  onZoom,
  notice,
  onBack,
  onOpenSheet,
  tileFor,
  next,
  onPlayNext,
  onPip,
  onCast,
}: Readonly<{
  engine: Engine;
  item: MediaItem;
  cue: string;
  appearance: SubtitleAppearance;
  statsOn: boolean;
  onToggleStats(): void;
  fill: boolean;
  onZoom(fill: boolean): void;
  notice?: string | null;
  onBack(): void;
  onOpenSheet(view?: SheetView): void;
  tileFor?: (abs: number) => StoryboardTile | null;
  next?: MediaItem | null;
  onPlayNext?(): void;
  onPip?(): void;
  onCast?(): void;
}>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stats = usePhoneStats(engine, item);

  const poke = () => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: arm the auto-hide once on mount
  useEffect(() => {
    poke();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [zoomNote, setZoomNote] = useState<string | null>(null);
  useEffect(() => {
    if (!zoomNote) return;
    const id = setTimeout(() => setZoomNote(null), 1100);
    return () => clearTimeout(id);
  }, [zoomNote]);

  // The gesture tree is memoized so GestureDetector does not re-diff the native
  // handler config on every engine tick; churning values reach it via this ref.
  const live = useRef({ visible, fill, engine, onZoom, t, poke });
  live.current = { visible, fill, engine, onZoom, t, poke };
  const gestures = useMemo(() => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd(() => {
        if (live.current.visible) setVisible(false);
        else live.current.poke();
      });
    const doubleTap = Gesture.Tap()
      .runOnJS(true)
      .numberOfTaps(2)
      .onEnd((e, ok) => {
        if (!ok) return;
        if (e.x < screenWidth / 3) live.current.engine.skip(-10);
        else if (e.x > (screenWidth * 2) / 3) live.current.engine.skip(10);
        else return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        live.current.poke();
      });
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onEnd((e) => {
        // A near-1 scale is an accidental two-finger touch, not an intent.
        if (Math.abs(e.scale - 1) < 0.15) return;
        const wantFill = e.scale > 1;
        const now = live.current;
        if (wantFill === now.fill) return;
        now.onZoom(wantFill);
        setZoomNote(wantFill ? now.t('player.zoomFill') : now.t('player.zoomFit'));
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      });
    return Gesture.Race(pinch, Gesture.Exclusive(doubleTap, tap));
  }, [screenWidth]);

  const intro = (item.markers ?? []).find(
    (m) => m.kind === 'intro' && engine.cur * 1000 >= m.startMs && engine.cur * 1000 < m.endMs,
  );
  const inCredits = (item.markers ?? []).some(
    (m) => m.kind === 'credits' && engine.cur * 1000 >= m.startMs,
  );

  return (
    <Box fill>
      {/* Tap layer sits BEHIND the controls: toggling visibility must not fire
          when a control is pressed. */}
      <GestureDetector gesture={gestures}>
        <Box fill />
      </GestureDetector>
      <Box style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <CueLine cue={cue} bottom={(visible ? 110 : 40) + insets.bottom} appearance={appearance} />

        {(zoomNote ?? notice) ? (
          <Box style={[s.zoomNote, { top: insets.top + 18 }]} pointerEvents="none">
            <Text style={s.zoomNoteText}>{zoomNote ?? notice}</Text>
          </Box>
        ) : null}

        {statsOn ? (
          <StatsPanel
            controller={{ getStats: stats }}
            onClose={onToggleStats}
            top={(visible ? 64 : 12) + insets.top}
            left={insets.left + 16}
            width={Math.min(460, screenWidth - insets.left - insets.right - 32)}
            maxHeight={
              screenHeight - ((visible ? 64 : 12) + insets.top) - Math.max(insets.bottom, 12)
            }
          />
        ) : null}

        {engine.waiting && !engine.failed && !visible ? <BufferingSpinner /> : null}

        {intro && !visible ? (
          <SkipIntroButton
            onPress={() => engine.seekTo(intro.endMs / 1000)}
            bottom={40 + insets.bottom}
          />
        ) : null}

        {inCredits && next && onPlayNext ? (
          <UpNextCard next={next} onPlayNext={onPlayNext} bottom={40 + insets.bottom} />
        ) : null}

        {visible ? (
          <ControlsLayer
            engine={engine}
            item={item}
            insets={insets}
            poke={poke}
            onBack={onBack}
            onOpenSheet={onOpenSheet}
            tileFor={tileFor}
            next={next}
            onPlayNext={onPlayNext}
            onPip={onPip}
            onCast={onCast}
          />
        ) : null}
      </Box>
    </Box>
  );
}

const s = styles({
  zoomNote: { absolute: true, self: 'center', px: 14, py: 7, bg: 'bg/80', radius: 999 },
  zoomNoteText: { color: 'text', fontSize: 12, fontWeight: '600' },
});
