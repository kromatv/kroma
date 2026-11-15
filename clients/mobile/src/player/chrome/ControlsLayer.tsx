import type { MediaItem } from '@kromatv/client/media';
import { audioTracksOf, episodeTag } from '@kromatv/core';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import type { Engine } from '#mobile/player/engine';
import type { SheetView } from '#mobile/player/TrackSheet';
import type { StoryboardTile } from '#mobile/player/useStoryboard';
import { ControlsFrame, RowShortcut } from './controls-frame';

export function ControlsLayer({
  engine,
  item,
  insets,
  poke,
  hold,
  onBack,
  onOpenSheet,
  tileFor,
  next,
  onPlayNext,
  onPip,
  onCast,
  onFullscreen,
  onBarLayout,
}: Readonly<{
  engine: Engine;
  item: MediaItem;
  insets: EdgeInsets;
  poke(): void;
  hold?(): () => void;
  onBack(): void;
  onOpenSheet(view?: SheetView): void;
  tileFor?: (abs: number) => StoryboardTile | null;
  next?: MediaItem | null;
  onPlayNext?(): void;
  onPip?(): void;
  onCast?(): void;
  onFullscreen?(): void;
  onBarLayout(height: number): void;
}>) {
  const t = useT();
  const title = item.showTitle ?? item.metadata?.title ?? item.title;
  // For an episode the big line is the SHOW, so the subtitle carries both the
  // tag and the episode's own name: "S1E2 · The Kingsroad", the way the TV
  // player's top bar reads.
  const tag = episodeTag(item);
  const episodeName = item.showTitle ? (item.metadata?.title ?? item.title) : undefined;
  const sub = [tag, episodeName].filter(Boolean).join(' · ') || undefined;

  const open = (view?: SheetView) => {
    onOpenSheet(view);
    poke();
  };
  // The audio shortcut earns its spot only when there is a choice to make.
  const audioCount = engine.offline ? engine.localAudio.length : audioTracksOf(item).length;

  return (
    <ControlsFrame
      engine={engine}
      title={title}
      subtitle={sub}
      markers={(item.markers ?? []).map((m) => m.startMs / 1000)}
      tileFor={tileFor}
      insets={insets}
      poke={poke}
      hold={hold}
      onBack={onBack}
      onBarLayout={onBarLayout}
      start={
        <>
          {audioCount > 1 ? (
            <RowShortcut
              icon="wave-sine"
              label={t('player.audioTracks')}
              onPress={() => open('audio')}
            />
          ) : null}
          <RowShortcut
            icon="badge-cc"
            label={t('player.subtitles')}
            onPress={() => open('subtitles')}
          />
          <RowShortcut icon="gauge" label={t('player.speed')} onPress={() => open('speed')} />
        </>
      }
      end={
        <>
          {next && onPlayNext ? (
            <RowShortcut
              icon="player-track-next"
              label={t('player.nextEpisode')}
              onPress={onPlayNext}
            />
          ) : null}
          {onCast ? (
            <RowShortcut
              icon="cast"
              label={t('cast.moveToTv')}
              onPress={() => {
                onCast();
                poke();
              }}
            />
          ) : null}
          {onPip ? (
            <RowShortcut
              icon="picture-in-picture"
              label={t('player.pip')}
              onPress={() => {
                onPip();
                poke();
              }}
            />
          ) : null}
          <RowShortcut icon="settings" label={t('player.settings')} onPress={() => open()} />
          {onFullscreen ? (
            <RowShortcut
              icon="minimize"
              label={t('player.exitFullscreen')}
              onPress={onFullscreen}
            />
          ) : null}
        </>
      }
    />
  );
}
