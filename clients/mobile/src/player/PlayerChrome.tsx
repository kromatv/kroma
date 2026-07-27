// The player overlay shell: the tap surface that shows and hides the controls
// (tap to toggle, double-tap the screen edges to skip 10s) and the overlays that
// stay up regardless. Pure presentation over the Engine; all playback logic
// lives in engine/.

import { audioTracksOf, type MediaItem } from '@kroma/core';
import {
  audioFilterLabels,
  buildLeanStats,
  type PlayerStats,
  StatsPanel,
  type SubtitleAppearance,
} from '@kroma/ui';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { ControlsLayer } from './chrome/ControlsLayer';
import { BufferingSpinner, CueLine, SkipIntroButton, UpNextCard } from './chrome/overlays';
import type { Engine } from './engine';
import type { SheetView } from './TrackSheet';
import type { StoryboardTile } from './useStoryboard';

const HIDE_AFTER_MS = 4000;

/**
 * The "stats for nerds" snapshot: the shared lean builder (metadata + engine
 * clock; AVPlayer and ExoPlayer expose no decode counters to JS) plus the
 * phone's own playback rows.
 *
 * A hook of its own because none of it is chrome. It was all inline, so the
 * bandwidth sampler, the label table and the whole snapshot closure were rebuilt
 * on every render of the player - twice a second for the length of a film -
 * while the panel that reads them is usually closed.
 */
function usePhoneStats(engine: Engine, item: MediaItem): () => PlayerStats {
  const t = useT();
  const filterLabels = audioFilterLabels(t);
  let sourceMode = 'HLS';
  if (engine.offline) sourceMode = 'Direct · local';
  else if (engine.mode === 'direct') sourceMode = 'Direct';

  // Download speed, estimated: AVPlayer exposes no network counters to JS, but
  // the buffered edge advancing IS the download - content-seconds fetched per
  // wall-second, times the stream's average bytes per content-second (file
  // size / duration), is bytes per second. Sampled between the panel's polls
  // and smoothed; a seek's buffer jump is clamped so it reads as a burst, not
  // a thousand-megabit lie.
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
  /** Whether the video fills the screen (cover) or letterboxes (contain). */
  fill: boolean;
  onZoom(fill: boolean): void;
  /** A transient status line for the top pill (subtitle preparing/unavailable);
   *  gesture notes (zoom) take precedence while present. */
  notice?: string | null;
  onBack(): void;
  onOpenSheet(view?: SheetView): void;
  tileFor?: (abs: number) => StoryboardTile | null;
  next?: MediaItem | null;
  onPlayNext?(): void;
  onPip?(): void;
  /** Hand this playback to a TV (absent when nothing is castable). */
  onCast?(): void;
}>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Everything the stats panel needs, and nothing the chrome does.
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

  // The gesture tree is memoized: this component re-renders on every engine
  // tick, and rebuilding the builders would make GestureDetector re-diff the
  // native handler config each time. Handlers read the values that churn
  // through this ref so they always see the current render's state.
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
        // Left third rewinds, right third fast-forwards, middle is ignored.
        if (e.x < screenWidth / 3) live.current.engine.skip(-10);
        else if (e.x > (screenWidth * 2) / 3) live.current.engine.skip(10);
        else return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        live.current.poke();
      });
    // Pinch-to-zoom, the YouTube gesture: out fills the screen, in letterboxes.
    // Binary snap rather than free scaling - the video is either cover or
    // contain - with a transient pill naming what just happened.
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
    <View style={StyleSheet.absoluteFill}>
      {/* Tap layer sits BEHIND the controls: toggling visibility must not fire
          when a control is pressed. */}
      <GestureDetector gesture={gestures}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <CueLine cue={cue} bottom={(visible ? 110 : 40) + insets.bottom} appearance={appearance} />

        {(zoomNote ?? notice) ? (
          <View style={[styles.zoomNote, { top: insets.top + 18 }]} pointerEvents="none">
            <Text style={styles.zoomNoteText}>{zoomNote ?? notice}</Text>
          </View>
        ) : null}

        {statsOn ? (
          <StatsPanel
            controller={{ getStats: stats }}
            onClose={onToggleStats}
            // Clear of the title bar while the controls are up; pocket width -
            // the panel is a read-out, not a takeover - and bounded to the
            // screen so its body scrolls instead of cropping.
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zoomNote: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(10, 10, 12, 0.8)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  zoomNoteText: { color: '#F4F3F0', fontSize: 12, fontWeight: '600' },
});
