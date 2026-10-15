import { LANG_OFF } from '@kromatv/core';
import type { SubtitleAppearance } from '@kromatv/ui';
import { AUDIO_FILTER_KEY } from '@kromatv/ui';
import { Box } from '@kromatv/ui/kit';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { PlayerPanel } from '#mobile/player/PlayerPanel';
import type { AudioFilterMode } from './engine';
import { SheetMenu, type SheetView } from './SheetMenu';
import { SubAppearanceView, sizeName } from './SubAppearanceView';
import { Row, SubHeader } from './TrackSheetRows';
import type { AudioOption } from './trackOptions';
import { subNote, subtitleLabel, subtitleRowLabel } from './trackOptions';
import type { Subtitles } from './useSubtitles';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export type { SheetView };

/** The rows a file with no catalogue row cannot answer. Absent means the row is
 * not drawn at all, which is how the watch screen opens the same sheet. */
export interface SheetExtras {
  quality?: string;
  filter?: { mode: AudioFilterMode; onPick(mode: AudioFilterMode): void };
  subtitles?: { of: Subtitles; onPick(index: number | null, language: string | null): void };
  appearance?: { value: SubtitleAppearance; onChange(next: Partial<SubtitleAppearance>): void };
  onReport?(): void;
}

export function TrackSheet({
  visible,
  onClose,
  audio,
  audioIndex,
  onAudio,
  rate,
  onRate,
  statsOn,
  onToggleStats,
  extras = {},
  initialView = 'menu',
}: Readonly<{
  visible: boolean;
  onClose(): void;
  audio: readonly AudioOption[];
  audioIndex: number;
  onAudio(track: AudioOption): void;
  rate: number;
  onRate(rate: number): void;
  statsOn?: boolean;
  onToggleStats?(): void;
  extras?: SheetExtras;
  initialView?: SheetView;
}>) {
  const t = useT();
  const [view, setView] = useState<SheetView>(initialView);
  const backToMenu = () => setView('menu');
  const done = () => onClose();
  useEffect(() => {
    if (visible) setView(initialView);
  }, [visible, initialView]);

  const slide = useRef(new Animated.Value(1)).current;
  const prevView = useRef(view);
  useEffect(() => {
    if (prevView.current === view) return;
    prevView.current = view;
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: 220,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  }, [view, slide]);
  const slideStyle = {
    opacity: slide,
    transform: [
      {
        translateX: slide.interpolate({
          inputRange: [0, 1],
          outputRange: [view === 'menu' ? -28 : 28, 0],
        }),
      },
    ],
  };
  const { quality, filter, subtitles: subs, appearance, onReport } = extras;

  const body = (
    <>
      {view === 'menu' ? (
        <SheetMenu
          t={t}
          quality={quality}
          audioCount={audio.length}
          audio={audio.find((a) => a.index === audioIndex)?.label}
          filter={filter && t(AUDIO_FILTER_KEY[filter.mode])}
          subtitles={subs && subtitleLabel(subs.of, t)}
          appearance={appearance && sizeName[appearance.value.size]}
          speed={rate === 1 ? t('player.normalSpeed') : `${rate}x`}
          statsOn={statsOn}
          onToggleStats={onToggleStats}
          go={setView}
          onReport={onReport}
        />
      ) : null}

      {view === 'quality' && quality ? (
        <Box>
          <SubHeader title={t('player.quality')} onBack={backToMenu} />
          <Row label={quality} selected onPress={done} />
        </Box>
      ) : null}

      {view === 'audio' ? (
        <Box>
          <SubHeader title={t('player.audioTracks')} onBack={backToMenu} />
          {audio.map((track) => (
            <Row
              key={track.index}
              label={track.label}
              selected={audioIndex === track.index}
              onPress={() => {
                onAudio(track);
                done();
              }}
            />
          ))}
        </Box>
      ) : null}

      {view === 'audioFilter' && filter ? (
        <Box>
          <SubHeader title={t('player.audioFilters')} onBack={backToMenu} />
          {(['off', 'standard', 'night'] as const).map((mode) => (
            <Row
              key={mode}
              label={t(AUDIO_FILTER_KEY[mode])}
              selected={filter.mode === mode}
              onPress={() => {
                filter.onPick(mode);
                done();
              }}
            />
          ))}
        </Box>
      ) : null}

      {view === 'subtitles' && subs ? (
        <SubtitleView subtitles={subs} onBack={backToMenu} onDone={done} />
      ) : null}

      {view === 'appearance' && appearance ? (
        <SubAppearanceView
          t={t}
          appearance={appearance.value}
          onAppearance={appearance.onChange}
          onBack={backToMenu}
        />
      ) : null}

      {view === 'speed' ? (
        <Box>
          <SubHeader title={t('player.speed')} onBack={backToMenu} />
          {SPEEDS.map((speed) => (
            <Row
              key={speed}
              label={speed === 1 ? t('player.normalSpeed') : `${speed}x`}
              selected={rate === speed}
              onPress={() => {
                onRate(speed);
                done();
              }}
            />
          ))}
        </Box>
      ) : null}
    </>
  );

  return (
    <PlayerPanel
      visible={visible}
      onClose={onClose}
      onRequestClose={view === 'menu' ? onClose : backToMenu}
    >
      <Animated.View style={slideStyle}>{body}</Animated.View>
    </PlayerPanel>
  );
}

function SubtitleView({
  subtitles,
  onBack,
  onDone,
}: Readonly<{
  subtitles: NonNullable<SheetExtras['subtitles']>;
  onBack(): void;
  onDone(): void;
}>) {
  const t = useT();
  const { of: subs, onPick } = subtitles;
  const pick = (index: number | null, language: string | null) => {
    onPick(index, language);
    onDone();
  };
  return (
    <Box>
      <SubHeader title={t('player.subtitles')} onBack={onBack} />
      <Row
        label={t('player.subtitlesOff')}
        selected={subs.active === null}
        onPress={() => pick(null, LANG_OFF)}
      />
      {subs.tracks.map((track) => (
        <Row
          key={track.index}
          label={subtitleRowLabel(t, track)}
          selected={subs.active === track.index}
          disabled={subs.failed.has(track.index)}
          note={subNote(t, subs, track.index)}
          onPress={() => pick(track.index, track.language ?? null)}
        />
      ))}
    </Box>
  );
}
