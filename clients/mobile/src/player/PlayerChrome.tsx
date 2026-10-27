// Pure presentation over the Engine; all playback logic lives in engine/.

import type { MediaItem } from '@kromatv/client/media';
import { ResumePrompt, StatsPanel, type SubtitleAppearance, useResumeNotice } from '@kromatv/ui';
import {
  Box,
  radius as cornerRadius,
  styles,
  Text,
  fontSizes as textSizes,
  useStableCallback,
  useStyles,
} from '@kromatv/ui/kit';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  useExclusiveGestures,
  usePinchGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { useChromeReveal } from '#mobile/player/useChromeReveal';
import { ControlsLayer } from './chrome/ControlsLayer';
import { PortraitControls } from './chrome/portrait-controls';
import { usePhoneStats } from './use-phone-stats';
import { CueLine, SkipIntroButton, UpNextCard } from './chrome/overlays';
import type { Engine } from './engine';
import type { SheetView } from './TrackSheet';
import type { StoryboardTile } from './useStoryboard';

function markersAt(item: MediaItem, sec: number) {
  const ms = sec * 1000;
  const markers = item.markers ?? [];
  return {
    intro: markers.find((m) => m.kind === 'intro' && ms >= m.startMs && ms < m.endMs),
    inCredits: markers.some((m) => m.kind === 'credits' && ms >= m.startMs),
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
  resumedAt,
  onBack,
  onOpenSheet,
  tileFor,
  next,
  onPlayNext,
  onPip,
  onCast,
  compact = false,
  onFullscreen,
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
  resumedAt?: number;
  onBack(): void;
  onOpenSheet(view?: SheetView): void;
  tileFor?: (abs: number) => StoryboardTile | null;
  next?: MediaItem | null;
  onPlayNext?(): void;
  onPip?(): void;
  onCast?(): void;
  compact?: boolean;
  onFullscreen?(): void;
}>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const safeInsets = useSafeAreaInsets();
  const insets = compact ? { top: 0, right: 0, bottom: 0, left: 0 } : safeInsets;
  const { shown, poke, toggle, hold } = useChromeReveal();
  const visible = shown || engine.waiting;

  const stats = usePhoneStats(engine, item);
  const resume = useResumeNotice({
    at: resumedAt || undefined,
    cur: engine.cur,
    playing: engine.playing,
    waiting: engine.waiting,
  });

  const window = useWindowDimensions();
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const screenWidth = bounds.width || window.width;
  const screenHeight = bounds.height || window.height;
  const [zoomNote, setZoomNote] = useState<string | null>(null);
  useEffect(() => {
    if (!zoomNote) return;
    const id = setTimeout(() => setZoomNote(null), 1100);
    return () => clearTimeout(id);
  }, [zoomNote]);

  const onTap = useStableCallback(() => toggle());
  const onDoubleTap = useStableCallback((x: number) => {
    if (x < screenWidth / 3) engine.skip(-10);
    else if (x > (screenWidth * 2) / 3) engine.skip(10);
    else return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    poke();
  });
  const onPinch = useStableCallback((scale: number) => {
    if (Math.abs(scale - 1) < 0.15) return;
    const wantFill = scale > 1;
    if (wantFill === fill) return;
    onZoom(wantFill);
    setZoomNote(wantFill ? t('player.zoomFill') : t('player.zoomFit'));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  });
  const tap = useTapGesture({
    runOnJS: true,
    onDeactivate: () => onTap(),
  });
  const doubleTap = useTapGesture({
    runOnJS: true,
    numberOfTaps: 2,
    onDeactivate: (e) => {
      if (!e.canceled) onDoubleTap(e.x);
    },
  });
  const pinch = usePinchGesture({
    runOnJS: true,
    onDeactivate: (e) => onPinch(e.scale),
  });
  const taps = useExclusiveGestures(doubleTap, tap);
  const gestures = useCompetingGestures(pinch, taps);

  const { intro, inCredits } = markersAt(item, engine.cur);
  const controls = compact ? { lift: 16, top: 42 } : { lift: 110, top: 64 };
  const lift = (visible ? controls.lift : 20) + insets.bottom;
  const statsTop = (visible ? controls.top : 12) + insets.top;

  return (
    <Box
      fill
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBounds((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
      }}
    >
      {/* Tap layer sits BEHIND the controls: toggling visibility must not fire
          when a control is pressed. */}
      <GestureDetector gesture={gestures}>
        <Box fill />
      </GestureDetector>
      <Box style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <CueLine cue={cue} bottom={lift} appearance={appearance} />

        {(zoomNote ?? notice) ? (
          <Box style={[s.zoomNote, { top: insets.top + 18 }]} pointerEvents="none">
            <Text style={s.zoomNoteText}>{zoomNote ?? notice}</Text>
          </Box>
        ) : null}

        {statsOn ? (
          <StatsPanel
            controller={{ getStats: stats }}
            onClose={onToggleStats}
            top={statsTop}
            left={insets.left + 16}
            width={Math.min(460, screenWidth - insets.left - insets.right - 32)}
            maxHeight={screenHeight - statsTop - Math.max(insets.bottom, 12)}
          />
        ) : null}

        {intro && !visible && !resume.shown ? (
          <SkipIntroButton
            onPress={() => engine.seekTo(intro.endMs / 1000)}
            bottom={40 + insets.bottom}
          />
        ) : null}

        {resumedAt ? (
          <ResumePrompt
            at={resumedAt}
            shown={resume.shown}
            secondsLeft={resume.secondsLeft}
            total={resume.total}
            lift={lift}
            onStartOver={() => {
              resume.dismiss();
              engine.seekTo(0);
            }}
          />
        ) : null}

        {inCredits && next && onPlayNext ? (
          <UpNextCard next={next} onPlayNext={onPlayNext} bottom={40 + insets.bottom} />
        ) : null}

        {visible && compact ? <PortraitControls engine={engine} poke={poke} /> : null}
        {visible && !compact ? (
          <ControlsLayer
            engine={engine}
            item={item}
            insets={insets}
            poke={poke}
            hold={hold}
            onBack={onBack}
            onOpenSheet={onOpenSheet}
            tileFor={tileFor}
            next={next}
            onPlayNext={onPlayNext}
            onPip={onPip}
            onCast={onCast}
            onFullscreen={onFullscreen}
          />
        ) : null}
      </Box>
    </Box>
  );
}

const sDefinition = styles({
  zoomNote: {
    absolute: true,
    self: 'center',
    px: 14,
    py: 7,
    bg: 'bg/80',
    radius: cornerRadius.pill,
  },
  zoomNoteText: { color: 'text', fontSize: textSizes.caption, fontWeight: '600' },
});
