// Player settings, phone-sized: mirrors the TV SettingsPanel's structure and
// visual language (icon rows, sub-views, same glyphs and shapes), but stays
// touch-driven — a modal or bottom sheet, no focus engine.

import {
  audioTrackLabel,
  audioTracksOf,
  LANG_OFF,
  langName,
  type MediaItem,
  refineTrackLang,
} from '@kroma/core';
import type { SubtitleAppearance } from '@kroma/ui';
import { AUDIO_FILTER_KEY, SUB_COLORS } from '@kroma/ui';
import { Box, Chip, Icon, type IconName, SwitchFace, styles, Txt } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { useLangPrefs } from '#mobile/lib/langPrefs';
import { colors, spacing, type } from '#mobile/lib/theme';
import { PlayerPanel } from '#mobile/player/PlayerPanel';
import type { Engine } from './engine';
import type { Subtitles } from './useSubtitles';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export type SheetView =
  | 'menu'
  | 'quality'
  | 'audio'
  | 'audioFilter'
  | 'subtitles'
  | 'appearance'
  | 'speed';

function Row({
  label,
  selected,
  disabled,
  note,
  onPress,
}: Readonly<{
  label: string;
  selected: boolean;
  disabled?: boolean;
  note?: string;
  onPress(): void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.row,
        selected && s.rowOn,
        pressed && { backgroundColor: colors.surfaceHigh },
        disabled && s.rowDisabled,
      ]}
    >
      <Txt style={[s.rowLabel, selected && s.rowLabelOn]}>{label}</Txt>
      {note ? <Txt style={s.rowNote}>{note}</Txt> : null}
      {selected ? <Icon name="check" size={17} stroke={2.4} color={colors.accent} /> : null}
    </Pressable>
  );
}

function MenuRow({
  icon,
  label,
  value,
  toggle,
  on,
  onPress,
}: Readonly<{
  icon: IconName;
  label: string;
  value?: string;
  toggle?: boolean;
  on?: boolean;
  onPress(): void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={toggle ? { checked: Boolean(on) } : undefined}
      style={({ pressed }) => [s.menuRow, pressed && { backgroundColor: colors.surfaceHigh }]}
    >
      <Icon name={icon} size={20} stroke={1.8} color={colors.textDim} />
      <Box style={s.menuText}>
        <Txt style={s.menuLabel}>{label}</Txt>
        {!toggle && value ? (
          <Txt lines={1} style={s.menuValue}>
            {value}
          </Txt>
        ) : null}
      </Box>
      {toggle ? (
        <SwitchFace checked={Boolean(on)} style={s.noShrink} />
      ) : (
        <Icon name="chevron-right" size={18} stroke={2.2} color={colors.textFaint} />
      )}
    </Pressable>
  );
}

function SubHeader({ title, onBack }: Readonly<{ title: string; onBack(): void }>) {
  return (
    <Pressable onPress={onBack} style={({ pressed }) => [s.subHeader, pressed && { opacity: 0.7 }]}>
      <Icon name="chevron-left" size={20} stroke={2.4} color={colors.text} />
      <Txt style={s.subTitle}>{title}</Txt>
    </Pressable>
  );
}

function ChipGroup({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Box style={s.chipGroup}>
      <Txt style={s.group}>{label}</Txt>
      <Box style={s.chipRow}>{children}</Box>
    </Box>
  );
}

interface AudioOption {
  index: number;
  prefCode: string | null;
  label: string;
}

// `prefCode` is the language refined by the variant in the track's title
// ('fre' + "VFF …" -> 'fr-FR'), so picking the France dub never auto-picks
// the Quebec one on the next title.
function audioOptions(engine: Engine, item: MediaItem, t: ReturnType<typeof useT>): AudioOption[] {
  const itemAudio = audioTracksOf(item);
  if (!engine.offline) {
    return itemAudio.map((track, i) => ({
      index: track.index,
      prefCode: refineTrackLang(track.language, track.title),
      label: audioTrackLabel(t, track) ?? `#${i + 1}`,
    }));
  }
  const aligned = engine.localAudio.length === itemAudio.length;
  return engine.localAudio.map((native, i) => ({
    index: i,
    prefCode: refineTrackLang(native.language, native.label),
    label:
      (aligned ? audioTrackLabel(t, itemAudio[i]) : undefined) ??
      (native.label?.trim() || langName(t, native.language) || `#${i + 1}`),
  }));
}

function subtitleLabel(subs: Subtitles, t: ReturnType<typeof useT>): string {
  if (subs.active === null) return t('player.subtitlesOff');
  const track = subs.tracks.find((s) => s.index === subs.active);
  return track?.label?.trim() ?? langName(t, track?.language) ?? `#${(subs.active ?? 0) + 1}`;
}

function SheetMenu(
  at: Readonly<{
    t: ReturnType<typeof useT>;
    quality: string;
    audioCount: number;
    audio: string | undefined;
    filter: string | null;
    subtitles: string;
    appearance: string;
    speed: string;
    statsOn: boolean;
    onToggleStats(): void;
    go(view: SheetView): void;
    onReport(): void;
  }>,
) {
  return (
    <Box style={s.menuList}>
      <MenuRow
        icon="badge-4k"
        label={at.t('player.quality')}
        value={at.quality}
        onPress={() => at.go('quality')}
      />
      {at.audioCount > 1 ? (
        <MenuRow
          icon="wave-sine"
          label={at.t('player.audioTracks')}
          value={at.audio}
          onPress={() => at.go('audio')}
        />
      ) : null}
      {at.filter === null ? null : (
        <MenuRow
          icon="adjustments-horizontal"
          label={at.t('player.audioFilters')}
          value={at.filter}
          onPress={() => at.go('audioFilter')}
        />
      )}
      <MenuRow
        icon="badge-cc"
        label={at.t('player.subtitles')}
        value={at.subtitles}
        onPress={() => at.go('subtitles')}
      />
      <MenuRow
        icon="typography"
        label={at.t('player.subAppearance')}
        value={at.appearance}
        onPress={() => at.go('appearance')}
      />
      <MenuRow
        icon="gauge"
        label={at.t('player.speed')}
        value={at.speed}
        onPress={() => at.go('speed')}
      />
      <MenuRow
        icon="chart-bar"
        label={at.t('player.stats')}
        toggle
        on={at.statsOn}
        onPress={at.onToggleStats}
      />
      <MenuRow icon="flag" label={at.t('reports.sheet')} onPress={at.onReport} />
    </Box>
  );
}

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
  const sizeName: Record<SubtitleAppearance['size'], string> = {
    sm: 'S',
    md: 'M',
    lg: 'L',
    xl: 'XL',
  };

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
        <Box>
          <SubHeader title={t('player.subAppearance')} onBack={backToMenu} />
          <ChipGroup label={t('player.subSize')}>
            {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
              <Chip
                key={size}
                label={sizeName[size]}
                active={appearance.size === size}
                onPress={() => onAppearance({ size })}
              />
            ))}
          </ChipGroup>
          <ChipGroup label={t('player.subColor')}>
            {SUB_COLORS.map((color) => (
              <Pressable
                key={color}
                onPress={() => onAppearance({ color })}
                style={[
                  s.swatch,
                  { backgroundColor: color },
                  appearance.color === color && s.swatchOn,
                ]}
              />
            ))}
          </ChipGroup>
          <ChipGroup label={t('player.subEdge')}>
            {(
              [
                ['shadow', t('subtitle.shadow')],
                ['uniform', t('subtitle.uniform')],
                ['raised', t('subtitle.raised')],
                ['depressed', t('subtitle.depressed')],
                ['none', t('subtitle.none')],
              ] as const
            ).map(([edge, label]) => (
              <Chip
                key={edge}
                label={label}
                active={appearance.edge === edge}
                onPress={() => onAppearance({ edge })}
              />
            ))}
          </ChipGroup>
        </Box>
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

function subNote(t: ReturnType<typeof useT>, subs: Subtitles, index: number): string | undefined {
  if (subs.failed.has(index)) return t('error.subtitleUnavailable');
  if (subs.active === index && subs.loading) return t('player.subPreparing');
  return undefined;
}

function qualityBadge(item: MediaItem): string {
  const v = item.video;
  if (!v) return '';
  const res = v.height ? `${v.height}p` : null;
  const codec = v.codec ? v.codec.toUpperCase() : null;
  const parts = [res, codec, v.hdr ? 'HDR' : null].filter(Boolean);
  return parts.length ? ` · ${parts.join(' ')}` : '';
}

const s = styles({
  menuList: { gap: 2 },
  menuRow: { row: true, align: 'center', gap: 14, minH: 54, px: spacing.md, py: 8, radius: 14 },
  menuText: { flex: true, minW: 0 },
  menuLabel: { ...type.body, color: 'text', fontWeight: '700' },
  menuValue: { ...type.small, mt: 1 },
  noShrink: { shrink: 0 },
  subHeader: { row: true, align: 'center', gap: 8, px: spacing.sm, py: 10, mb: spacing.xs },
  subTitle: { ...type.section, color: 'text' },
  group: {
    ...type.small,
    mb: spacing.xs,
    color: 'accent',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chipGroup: { px: spacing.sm, mb: spacing.md },
  chipRow: { row: true, wrap: true, align: 'center', gap: 8 },
  row: {
    row: true,
    between: true,
    align: 'center',
    gap: spacing.sm,
    minH: 48,
    px: spacing.md,
    radius: 14,
  },
  rowOn: { bg: 'white/10' },
  rowDisabled: { opacity: 0.45 },
  rowLabel: { ...type.body, shrink: 1, color: 'textMuted' },
  rowLabelOn: { color: 'text', fontWeight: '600' },
  rowNote: { ...type.small, color: 'textDim' },
  swatch: { w: 30, h: 30, radius: 15, border: 'transparent', borderWidth: 2 },
  swatchOn: { borderColor: 'accent' },
});
