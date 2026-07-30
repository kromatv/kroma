// Player settings: the TV settings panel's model at phone size. In the
// landscape player it slides in as a blurred side panel (safe-area aware); in
// portrait (tablets) it behaves as a bottom sheet.
//
// The STRUCTURE is the television's (@kroma/ui SettingsPanel): a main menu of
// icon rows - each naming its current value - opening one sub-view per
// setting, plus in-place toggles for Loop and Statistics and a row into the
// report flow. Same glyphs, same row shapes (radius-14, the 10% white fill on
// the chosen row, accent overlines), so a viewer who knows one player knows
// both. The UX stays the phone's: a modal sheet, touch rows, no focus engine.

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
import { Chip, Icon, type IconName, SwitchFace } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
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

/** A selectable sub-view row (the TV's selectRow, at phone scale). */
function Row({
  label,
  selected,
  disabled,
  note,
  onPress,
}: Readonly<{
  label: string;
  selected: boolean;
  /** A row the server cannot deliver (a subtitle whose extraction failed):
   *  shown, dimmed and inert, with the reason as its note - a silent row that
   *  does nothing reads as a broken app. */
  disabled?: boolean;
  note?: string;
  onPress(): void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowOn,
        pressed && { backgroundColor: colors.surfaceHigh },
        disabled && styles.rowDisabled,
      ]}
    >
      <Text style={[styles.rowLabel, selected && styles.rowLabelOn]}>{label}</Text>
      {note ? <Text style={styles.rowNote}>{note}</Text> : null}
      {selected ? <Icon name="check" size={17} stroke={2.4} color={colors.accent} /> : null}
    </Pressable>
  );
}

/** A main-menu row: the TV's menuRow - leading glyph, bold label with the
 * current value under it, a chevron into its sub-view OR an in-place switch. */
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
      style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.surfaceHigh }]}
    >
      <Icon name={icon} size={20} stroke={1.8} color={colors.textDim} />
      <View style={styles.menuText}>
        <Text style={styles.menuLabel}>{label}</Text>
        {!toggle && value ? (
          <Text numberOfLines={1} style={styles.menuValue}>
            {value}
          </Text>
        ) : null}
      </View>
      {toggle ? (
        <SwitchFace checked={Boolean(on)} style={styles.noShrink} />
      ) : (
        <Icon name="chevron-right" size={18} stroke={2.2} color={colors.textFaint} />
      )}
    </Pressable>
  );
}

/** A sub-view's header: back into the menu, then the setting's name. */
function SubHeader({ title, onBack }: Readonly<{ title: string; onBack(): void }>) {
  return (
    <Pressable
      onPress={onBack}
      style={({ pressed }) => [styles.subHeader, pressed && { opacity: 0.7 }]}
    >
      <Icon name="chevron-left" size={20} stroke={2.4} color={colors.text} />
      <Text style={styles.subTitle}>{title}</Text>
    </Pressable>
  );
}

/** Accent overline + chip row, for the appearance panel's compact pickers. */
function ChipGroup({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <View style={styles.chipGroup}>
      <Text style={styles.group}>{label}</Text>
      <View style={styles.chipRow}>{children}</View>
    </View>
  );
}

/** One selectable audio track, as the sheet lists it. */
interface AudioOption {
  index: number;
  prefCode: string | null;
  label: string;
}

/**
 * The audio tracks on offer, from whichever side knows about them.
 *
 * A downloaded file is described by the PLAYER (the native track list), a
 * streamed one by the item's own metadata - and where the two line up, the
 * item's richer label wins.
 *
 * `prefCode` is what a pick REMEMBERS: the language refined by the variant the
 * track's title betrays ('fre' + "VFF …" -> 'fr-FR'), so choosing the France
 * dub can never auto-pick the Quebec one on the next title.
 */
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

/** The subtitle row's value: Off, the track's own label, else its language. */
function subtitleLabel(subs: Subtitles, t: ReturnType<typeof useT>): string {
  if (subs.active === null) return t('player.subtitlesOff');
  const track = subs.tracks.find((s) => s.index === subs.active);
  return track?.label?.trim() ?? langName(t, track?.language) ?? `#${(subs.active ?? 0) + 1}`;
}

/**
 * The main menu: one row per setting, each naming its current value.
 *
 * Its own component because it is a flat list of what the sheet OFFERS, and
 * inlining it put seven more conditionals in a body that also owns the sheet's
 * animation, its sub-views and its gesture handling.
 */
function SheetMenu(
  at: Readonly<{
    t: ReturnType<typeof useT>;
    quality: string;
    audioCount: number;
    audio: string | undefined;
    /** Null where there is no filter to offer (an offline file). */
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
    <View style={styles.menuList}>
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
    </View>
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
  /** Open straight into a sub-view (the chrome's quick-access capsule), the
   *  kit SettingsPanel's own prop. */
  initialView?: SheetView;
}>) {
  const t = useT();
  const router = useRouter();
  const prefs = useLangPrefs();
  const [view, setView] = useState<SheetView>(initialView);
  const backToMenu = () => setView('menu');
  // A validated pick DISMISSES the sheet - the point of picking a track is to
  // get back to the film, and a shortcut that opened straight into a sub-view
  // has no menu to "return" to. The header's back chevron still walks to the
  // menu for whoever wants to browse the other settings.
  const done = () => onClose();
  // Each open starts where the trigger asked: the gear at the menu, the
  // capsule straight in the subtitles view - never wherever the last visit
  // happened to end (the Modal stays mounted between opens).
  useEffect(() => {
    if (visible) setView(initialView);
  }, [visible, initialView]);

  // Menu <-> sub-view slide: a sub-view enters from the right, the menu
  // re-enters from the left, opacity riding along so the swap never flashes.
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
        <View>
          <SubHeader title={t('player.quality')} onBack={backToMenu} />
          <Row label={qualityLabel} selected onPress={done} />
        </View>
      ) : null}

      {view === 'audio' ? (
        <View>
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
        </View>
      ) : null}

      {view === 'audioFilter' ? (
        <View>
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
        </View>
      ) : null}

      {view === 'subtitles' ? (
        <View>
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
        </View>
      ) : null}

      {view === 'appearance' ? (
        <View>
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
                  styles.swatch,
                  { backgroundColor: color },
                  appearance.color === color && styles.swatchOn,
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
        </View>
      ) : null}

      {view === 'speed' ? (
        <View>
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
        </View>
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

/** The subtitle row's status note: "preparing" while its VTT request is in
 * flight (a first request can wait on the server extracting the whole file),
 * "unavailable" once it broke, nothing otherwise. */
function subNote(t: ReturnType<typeof useT>, subs: Subtitles, index: number): string | undefined {
  if (subs.failed.has(index)) return t('error.subtitleUnavailable');
  if (subs.active === index && subs.loading) return t('player.subPreparing');
  return undefined;
}

/** " · 2160p HEVC"-style suffix for the quality row, from the file itself. */
function qualityBadge(item: MediaItem): string {
  const v = item.video;
  if (!v) return '';
  const res = v.height ? `${v.height}p` : null;
  const codec = v.codec ? v.codec.toUpperCase() : null;
  const parts = [res, codec, v.hdr ? 'HDR' : null].filter(Boolean);
  return parts.length ? ` · ${parts.join(' ')}` : '';
}

const styles = StyleSheet.create({
  menuList: { gap: 2 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 14,
  },
  menuText: { flex: 1, minWidth: 0 },
  menuLabel: { ...type.body, color: colors.text, fontWeight: '700' },
  menuValue: { ...type.small, marginTop: 1 },
  noShrink: { flexShrink: 0 },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    marginBottom: spacing.xs,
  },
  subTitle: { ...type.section, color: colors.text },
  /** The panel's section voice: the TV settings' accent overline. */
  group: {
    ...type.small,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  chipGroup: { paddingHorizontal: spacing.sm, marginBottom: spacing.md },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    gap: spacing.sm,
  },
  rowOn: { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  rowDisabled: { opacity: 0.45 },
  rowLabel: { ...type.body, color: colors.textDim, flexShrink: 1 },
  rowLabelOn: { color: colors.text, fontWeight: '600' },
  rowNote: { ...type.small, color: colors.textFaint },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchOn: { borderColor: colors.accent },
});
