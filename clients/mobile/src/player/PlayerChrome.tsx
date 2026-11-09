// Pure presentation over the Engine; all playback logic lives in engine/.

import type { MediaItem } from '@kromatv/client/media';
import { sizedImageUrl } from '@kromatv/core';
import { ResumePrompt, StatsPanel, type SubtitleAppearance, useResumeNotice } from '@kromatv/ui';
import { useClient } from '#mobile/lib/session';
import { ChromeSurface } from './chrome/chrome-surface';
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
  const client = useClient();
  const stats = usePhoneStats(engine, item);
  const resume = useResumeNotice({
    at: resumedAt || undefined,
    cur: engine.cur,
    playing: engine.playing,
    waiting: engine.waiting,
  });

  const { intro, inCredits } = markersAt(item, engine.cur);

  return (
    <ChromeSurface engine={engine} fill={fill} onZoom={onZoom} notice={notice} compact={compact}>
      {({ visible, insets, lift, top, width, height, poke, hold }) => (
        <>
          <CueLine cue={cue} bottom={lift} appearance={appearance} />

          {statsOn ? (
            <StatsPanel
              controller={{ getStats: stats }}
              onClose={onToggleStats}
              top={top}
              left={insets.left + 16}
              width={Math.min(460, width - insets.left - insets.right - 32)}
              maxHeight={height - top - Math.max(insets.bottom, 12)}
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
              title={item.title}
              art={sizedImageUrl(client.media.artwork.backdropFor(item), 400)}
              shown={resume.shown}
              secondsLeft={resume.secondsLeft}
              total={resume.total}
              lift={lift}
              onResume={resume.dismiss}
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
        </>
      )}
    </ChromeSurface>
  );
}
