// Player settings, phone-sized: mirrors the TV SettingsPanel's structure and
// visual language (icon rows, sub-views, same glyphs and shapes), but stays
// touch-driven: a modal or bottom sheet, no focus engine.

import { LANG_OFF, langName, type MediaItem } from '@kroma/core';
import type { SubtitleAppearance } from '@kroma/ui';
import { AUDIO_FILTER_KEY } from '@kroma/ui';
import { Box } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { useLangPrefs } from '#mobile/lib/langPrefs';
import { PlayerPanel } from '#mobile/player/PlayerPanel';
import type { Engine } from './engine';
import { SheetMenu, type SheetView } from './SheetMenu';
import { SubAppearanceView, sizeName } from './SubAppearanceView';
import { Row, SubHeader } from './TrackSheetRows';
import { audioOptions, qualityBadge, subNote, subtitleLabel } from './trackOptions';
import type { Subtitles } from './useSubtitles';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export type { SheetView };

export function TrackSheet({
  visible,
  onClose,
  engine,
  subs,
  item,
  appearance,
  onAppearance,
  statsOn,
  onToggleStats,
  initialView = 'menu',
}: Readonly<{
  visible: boolean;
  onClose(): void;
  engine: Engine;
  subs: Subtitles;
  item: MediaItem;
  appearance: SubtitleAppearance;
  onAppearance(next: Partial<SubtitleAppearance>): void;
  statsOn: boolean;
  onToggleStats(): void;
  initialView?: SheetView;
}>) {
  const t = useT();
  const router = useRouter();
  const prefs = useLangPrefs();
  const [view, setView] = useState<SheetView>(initialView);
  const backToMenu = () => setView('menu');
  // Picking a track dismisses the whole sheet rather than returning to the
  // menu; the back chevron is what browses the other settings.
  const done = () => onClose();
  // The Modal stays mounted between opens, so each open must reset to
  // `initialView` rather than resuming wherever the last visit ended.
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
  const audio = audioOptions(engine, item, t);
  const currentAudio = audio.find((a) => a.index === engine.audioIndex)?.label;
  const currentSub = subtitleLabel(subs, t);
  // Direct play has no ladder to climb: the one "quality" is the file itself,
  // which is exactly what the TV's row says too.
  const qualityLabel = `${t('player.qualityAuto')}${qualityBadge(item)}`;
  const filterLabel = t(AUDIO_FILTER_KEY[engine.filter]);
  const speedLabel = engine.rate === 1 ? t('player.normalSpeed') : `${engine.rate}x`;
  const menu = (
    <SheetMenu
      t={t}
      quality={qualityLabel}
      audioCount={audio.length}
      audio={currentAudio}
      filter={engine.offline ? null : filterLabel}
      subtitles={currentSub}
      appearance={sizeName[appearance.size]}
      speed={speedLabel}
      statsOn={statsOn}
      onToggleStats={onToggleStats}
      go={setView}
      onReport={() => {
        onClose();
        router.push(
          `/report/${item.id}?kind=${item.kind === 'episode' ? 'episode' : 'movie'}` as never,
        );
      }}
    />
  );

  const body = (
    <>
      {view === 'menu' ? menu : null}

      {view === 'quality' ? (
        <Box>
          <SubHeader title={t('player.quality')} onBack={backToMenu} />
          <Row label={qualityLabel} selected onPress={done} />
        </Box>
      ) : null}

      {view === 'audio' ? (
        <Box>
          <SubHeader title={t('player.audioTracks')} onBack={backToMenu} />
          {audio.map((track) => (
            <Row
              key={track.index}
              label={track.label}
              selected={engine.audioIndex === track.index}
              onPress={() => {
                engine.setAudio(track.index);
                // Picking a language REMEMBERS it (account-level, like the
                // TV): the next title opens on this language when it can.
                if (track.prefCode) prefs.setAudio(track.prefCode);
                done();
              }}
            />
          ))}
        </Box>
      ) : null}

      {view === 'audioFilter' ? (
        <Box>
          <SubHeader title={t('player.audioFilters')} onBack={backToMenu} />
          {(['off', 'standard', 'night'] as const).map((mode) => (
            <Row
              key={mode}
              label={t(AUDIO_FILTER_KEY[mode])}
              selected={engine.filter === mode}
              onPress={() => {
                engine.setFilter(mode);
                done();
              }}
            />
          ))}
        </Box>
      ) : null}

      {view === 'subtitles' ? (
        <Box>
          <SubHeader title={t('player.subtitles')} onBack={backToMenu} />
          <Row
            label={t('player.subtitlesOff')}
            selected={subs.active === null}
            onPress={() => {
              subs.pick(null);
              // "Off" is itself a remembered preference: the next title starts
              // with subtitles off instead of re-enabling the old language.
              prefs.setSubtitle(LANG_OFF);
              done();
            }}
          />
          {subs.tracks.map((track) => (
            <Row
              key={track.index}
              label={
                (track.label?.trim() || langName(t, track.language) || `#${track.index + 1}`) +
                (track.ai ? ' · IA' : '')
              }
              selected={subs.active === track.index}
              disabled={subs.failed.has(track.index)}
              // A first request can sit through a server-side extraction of the
              // whole file; say so instead of looking dead. A broken track says
              // unavailable.
              note={subNote(t, subs, track.index)}
              onPress={() => {
                subs.pick(track.index);
                if (track.language) prefs.setSubtitle(track.language);
                done();
              }}
            />
          ))}
        </Box>
      ) : null}

      {view === 'appearance' ? (
        <SubAppearanceView
          t={t}
          appearance={appearance}
          onAppearance={onAppearance}
          onBack={backToMenu}
        />
      ) : null}

      {view === 'speed' ? (
        <Box>
          <SubHeader title={t('player.speed')} onBack={backToMenu} />
          {SPEEDS.map((s) => (
            <Row
              key={s}
              label={s === 1 ? t('player.normalSpeed') : `${s}x`}
              selected={engine.rate === s}
              onPress={() => {
                engine.setRate(s);
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
      // Back walks to the menu first when a sub-view is open; only the menu
      // itself closes the panel.
      onRequestClose={view === 'menu' ? onClose : backToMenu}
    >
      <Animated.View style={slideStyle}>{body}</Animated.View>
    </PlayerPanel>
  );
}
