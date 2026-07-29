import type { AudioTrack, MessageKey, ReportCategory } from '@kroma/core';
import { langName } from '@kroma/core';
import { Fragment, forwardRef, type ReactNode, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Txt } from '#ui/components/atoms/text';
import { BackButton } from '#ui/components/molecules/back-button';
import { useT } from '#ui/services/i18n';
import { useListFocus } from '../hooks/useListFocus';
import { audioFilterLabels } from '../lib/audio-filter';
import { PANEL_MAX, scaler } from '../lib/metrics';
import type { ControlId, PanelHandle } from '../lib/nav';
import { EYEBROW, PANEL } from '../lib/style';
import type { SubtitleAppearance } from '../lib/subtitle-appearance';
import { VIRTUAL_FOCUS } from '../lib/virtual-focus';
import type { AudioFilterMode, PlayerController, PlayerQuality, PlayerSub } from '../types';
import {
  IconAppearance,
  IconAudioFilter,
  IconAudioTrack,
  IconBack10,
  IconCast,
  IconFwd10,
  IconGear,
  IconMute,
  IconNext,
  IconPip,
  IconQuality,
  IconReport,
  IconSpeed,
  IconStats,
  IconSubtitles,
} from './icons';
import { AudioFilterPanel } from './settings/AudioFilterPanel';
import { AudioPanel } from './settings/AudioPanel';
import type { SubtitleGenBundle } from './settings/gen';
import { MenuRow } from './settings/menu-row';
import { QualityPanel } from './settings/QualityPanel';
import { ReportPanel } from './settings/ReportPanel';
import { SpeedPanel } from './settings/SpeedPanel';
import { SubtitleAppearancePanel } from './settings/SubtitleAppearancePanel';
import { SubtitlesPanel } from './settings/SubtitlesPanel';

// Sub-views the menu can open; toggles (statistics) act in place.
type View =
  | 'menu'
  | 'quality'
  | 'engine'
  | 'audio'
  | 'audioFilter'
  | 'subtitles'
  | 'appearance'
  | 'speed'
  | 'report';

interface SettingsPanelProps {
  controller: PlayerController;
  /** Controls the transport row had no room for (see ../lib/metrics). The panel
   *  grows a row for each, so a narrow window moves them here instead of losing
   *  them; `audio` and `subtitles` are ignored because the menu already lists
   *  them. Empty on any stage wide enough for the whole row. */
  overflow?: readonly ControlId[];
  /** Run one of those controls. The player closes the panel first: pip, cast
   *  and the next episode all change what is on screen behind it. */
  onControl?: (id: ControlId) => void;
  appearance: SubtitleAppearance;
  onAppearance: (p: Partial<SubtitleAppearance>) => void;
  statsOn: boolean;
  onToggleStats: () => void;
  subtitleGen: SubtitleGenBundle;
  /** Report a problem with what is playing. The menu grows a "Signaler un
   * problème" row only when the host provides this, so a surface with its own
   * reporting flow (or none) is unaffected. */
  onReport?: (category: ReportCategory) => Promise<void>;
  /** The panel's width in px, from `panelGeometry` - the whole stage once a
   *  44% panel would be too narrow to read. */
  width?: number;
  /** The panel covers the stage, so there is no scrim left to tap: the menu
   *  grows its own close X (a finger has no Back key). */
  covers?: boolean;
  /** The chrome's scale (see ../lib/metrics). 1 on a television stage. */
  scale?: number;
  /** Open straight into a sub-view (the Audio / Subtitles cluster quick-access). */
  initialView?: View;
  onClose: () => void;
}

/** One main-menu entry: a navigable sub-panel, an in-place toggle, or a control
 * the transport row could not fit (see `OVERFLOW`). */
interface Entry {
  id: View | 'stats' | ControlId;
  icon: ReactNode;
  label: string;
  value?: ReactNode;
  toggle?: boolean;
  on?: boolean;
  activate: () => void;
}

/**
 * The controls a narrow row hands to this panel, as menu rows.
 *
 * `audio` and `subtitles` are deliberately absent: the menu below already lists
 * both, and a second row for the same thing would be the panel disagreeing with
 * itself. Everything else the row can shed is here, which is what makes shedding
 * safe - `chromeMetrics` may drop a button from the transport precisely because
 * this exists.
 */
const OVERFLOW: Partial<Record<ControlId, { icon: ReactNode; label: MessageKey }>> = {
  next: { icon: <IconNext />, label: 'player.nextEpisode' },
  cast: { icon: <IconCast />, label: 'cast.moveToTv' },
  pip: { icon: <IconPip />, label: 'player.pip' },
  volume: { icon: <IconMute />, label: 'player.mute' },
  rewind: { icon: <IconBack10 />, label: 'player.back10' },
  forward: { icon: <IconFwd10 />, label: 'player.fwd10' },
};

/** The overflow section, in the row's own order. Volume is a toggle because
 * that is what activating it does (mute), not a sub-view. */
function overflowEntries(at: {
  t: ReturnType<typeof useT>;
  muted: boolean;
  overflow: readonly ControlId[];
  onControl: ((id: ControlId) => void) | undefined;
}): Entry[] {
  if (!at.onControl) return [];
  return at.overflow.flatMap((id) => {
    const row = OVERFLOW[id];
    if (!row) return [];
    return [
      {
        id,
        icon: row.icon,
        label: at.t(row.label),
        toggle: id === 'volume',
        on: id === 'volume' ? at.muted : undefined,
        activate: () => at.onControl?.(id),
      },
    ];
  });
}

/** The subtitles menu-row value: Off, an AI track's own label, else the language. */
function subtitleValue(t: ReturnType<typeof useT>, curSub: PlayerSub | null | undefined): string {
  if (!curSub) return t('player.subtitlesOff');
  if (curSub.ai && curSub.label) return curSub.label;
  return langName(t, curSub.language) || t('player.langUnknown');
}

/** The panel heading: "Settings" on the menu, else the open sub-view's label. */
function panelTitle(view: View, entries: Entry[], t: ReturnType<typeof useT>): string {
  if (view === 'menu') return t('player.settings');
  return entries.find((e) => e.id === view)?.label ?? '';
}

/** The menu, as rows. A pure table of what the panel offers, so which rows exist
 * (an engine picker only where there is more than one engine, a filter row only
 * where a DSP can deliver it, the report row only where the host takes reports)
 * is one readable list rather than four conditionals inside a component body. */
function menuEntries(at: {
  t: ReturnType<typeof useT>;
  c: PlayerController;
  quality: PlayerQuality | undefined;
  audio: AudioTrack | undefined;
  subtitles: string;
  filterLabels: Record<AudioFilterMode, string>;
  statsOn: boolean;
  onToggleStats: () => void;
  onReport: boolean;
  go: (view: View) => void;
}): Entry[] {
  return [
    {
      id: 'quality',
      icon: <IconQuality />,
      label: at.t('player.quality'),
      value: at.quality?.label,
      activate: () => at.go('quality'),
    },
    ...(at.c.engines?.length
      ? [
          {
            id: 'engine' as const,
            icon: <IconGear />,
            label: at.t('playbackEngine.title'),
            value: at.c.engines.find((e) => e.id === at.c.engineId)?.label,
            activate: () => at.go('engine'),
          },
        ]
      : []),
    {
      id: 'audio',
      icon: <IconAudioTrack />,
      label: at.t('player.audioTrack'),
      value: at.audio
        ? at.audio.title?.trim() || langName(at.t, at.audio.language) || at.t('player.langUnknown')
        : undefined,
      activate: () => at.go('audio'),
    },
    ...(at.c.audioFilterSupported
      ? [
          {
            id: 'audioFilter' as const,
            icon: <IconAudioFilter />,
            label: at.t('player.audioFilters'),
            value: at.filterLabels[at.c.audioFilter],
            activate: () => at.go('audioFilter'),
          },
        ]
      : []),
    {
      id: 'subtitles',
      icon: <IconSubtitles />,
      label: at.t('player.subtitles'),
      value: at.subtitles,
      activate: () => at.go('subtitles'),
    },
    {
      id: 'appearance',
      icon: <IconAppearance />,
      label: at.t('player.subAppearance'),
      activate: () => at.go('appearance'),
    },
    {
      id: 'speed',
      icon: <IconSpeed />,
      label: at.t('player.speed'),
      value: at.c.rate === 1 ? at.t('player.normalSpeed') : `${at.c.rate}×`,
      activate: () => at.go('speed'),
    },
    {
      id: 'stats',
      icon: <IconStats />,
      label: at.t('player.stats'),
      toggle: true,
      on: at.statsOn,
      activate: at.onToggleStats,
    },
    // Last on purpose: it is the row nobody wants to need, and the one that must
    // be there when they do.
    ...(at.onReport
      ? [
          {
            id: 'report' as const,
            icon: <IconReport />,
            label: at.t('report.action'),
            activate: () => at.go('report'),
          },
        ]
      : []),
  ];
}

/**
 * The right-side settings panel (§5): a two-level surface over a click-to-close
 * scrim. A main menu lists every setting; OK opens a sub-view (or toggles
 * Statistics in place). Keys route to the open sub-view's {@link PanelHandle} when
 * one is open, else to the menu. Back in a sub-view returns to the menu; Back in
 * the menu closes the panel.
 */
export const SettingsPanel = forwardRef<PanelHandle, SettingsPanelProps>(function SettingsPanel(
  {
    controller: c,
    appearance,
    onAppearance,
    statsOn,
    onToggleStats,
    subtitleGen,
    onReport,
    overflow,
    onControl,
    width,
    covers,
    scale = 1,
    initialView,
    onClose,
  },
  ref,
) {
  const t = useT();
  const px = scaler(scale);
  const [view, setView] = useState<View>(initialView ?? 'menu');
  const subRef = useRef<PanelHandle>(null);
  const backToMenu = () => setView('menu');

  const curQuality = c.qualities.find((q) => q.id === c.qualityId);
  const curAudio = c.audioTracks.find((a) => a.index === c.audioIndex);
  const curSub =
    c.subtitleIndex == null ? null : c.subtitles.find((s) => s.index === c.subtitleIndex);
  const filterLabels = audioFilterLabels(t);

  const subValue = subtitleValue(t, curSub);

  // The controls this stage could not fit come FIRST: they are the reason the
  // panel was opened on a narrow window, and burying them under the quality
  // picker would make "the cast button disappeared" true in practice.
  const moved = overflowEntries({
    t,
    muted: Boolean(c.muted),
    overflow: overflow ?? [],
    onControl,
  });
  const entries = [
    ...moved,
    ...menuEntries({
      t,
      c,
      quality: curQuality,
      audio: curAudio,
      subtitles: subValue,
      filterLabels,
      statsOn,
      onToggleStats,
      onReport: Boolean(onReport),
      go: setView,
    }),
  ];

  const menuFocus = useListFocus({
    count: entries.length,
    onActivate: (i) => entries[i]?.activate(),
    // Back at the menu closes the panel, here rather than by declining the key
    // and trusting the shell to notice: that fall-through never fired on Apple
    // TV, and a settings panel you cannot leave with the remote's Back button is
    // a dead end in the middle of a film.
    onBack: onClose,
  });
  useImperativeHandle(
    ref,
    () => ({
      onKey: (k) => (view === 'menu' ? menuFocus.onKey(k) : Boolean(subRef.current?.onKey(k))),
    }),
    [view, menuFocus.onKey],
  );

  const title = panelTitle(view, entries, t);

  return (
    <>
      {/* Press-to-close scrim; Back on the D-pad closes the panel and this
          mirrors it for a pointer (§15). */}
      {/* The scrim is exactly what the panel leaves behind: `right` rather than
          a 56% that only agreed with the panel at its design width. */}
      <Pressable
        {...VIRTUAL_FOCUS}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: width ?? '44%',
          zIndex: 41,
        }}
      />
      <ScrollView
        style={[PANEL, { width: width ?? '44%', maxWidth: PANEL_MAX }]}
        contentContainerStyle={{ paddingHorizontal: px(58), paddingVertical: px(56) }}
        showsVerticalScrollIndicator={false}
      >
        <Box row align="center" gap={px(18)} mb={px(30)}>
          {view !== 'menu' ? (
            // Pointer-only (the remote leaves a sub-view with Back), controlled
            // at `false`: never a platform / navigator focus target - see
            // ../lib/virtual-focus.ts.
            <BackButton
              variant="glass"
              size={px(46)}
              focused={false}
              onPress={backToMenu}
              label={t('player.back')}
            />
          ) : null}
          <Txt lines={1} variant="h1" style={{ fontSize: px(38), flexShrink: 1 }}>
            {title}
          </Txt>
          {/* Covering the stage leaves no scrim to tap, and a phone has no Back
              key - so the way out has to be on the panel. Pointer-only,
              controlled at `false`: never a platform / navigator focus target
              (the remote still leaves with Back). */}
          {covers ? (
            <IconButton
              variant="ghost"
              size={px(44)}
              icon="x"
              glyph={px(20)}
              focused={false}
              hitSlop={6}
              style={CLOSE}
              onPress={onClose}
              label={t('common.close')}
            />
          ) : null}
        </Box>

        {view === 'menu' ? (
          <Box gap={px(12)}>
            {entries.map((e, i) => (
              <Fragment key={e.id}>
                {/* The moved controls are their own group: an eyebrow over them
                    and a gap under, so an action and a setting never read as one
                    undifferentiated list. Both only exist when the transport row
                    actually handed something over. */}
                {moved.length > 0 && i === 0 ? (
                  <Txt style={[EYEBROW, { fontSize: px(12) }]}>{t('player.movedControls')}</Txt>
                ) : null}
                <MenuRow
                  icon={e.icon}
                  label={e.label}
                  value={e.value}
                  toggle={e.toggle}
                  on={e.on}
                  focused={menuFocus.index === i}
                  onActivate={e.activate}
                  onFocus={menuFocus.hover(i)}
                  style={i === moved.length && moved.length > 0 ? { marginTop: px(20) } : undefined}
                />
              </Fragment>
            ))}
          </Box>
        ) : null}

        {view === 'quality' ? (
          <QualityPanel
            ref={subRef}
            qualities={c.qualities}
            current={c.qualityId}
            onSelect={(id) => c.setQuality(id)}
            onBack={backToMenu}
          />
        ) : null}
        {view === 'engine' && c.engines ? (
          // Engine options share the quality picker's shape (single-select id/label).
          <QualityPanel
            ref={subRef}
            qualities={c.engines}
            current={c.engineId ?? ''}
            onSelect={(id) => c.setEngine?.(id)}
            onBack={backToMenu}
          />
        ) : null}
        {view === 'audio' ? (
          <AudioPanel
            ref={subRef}
            tracks={c.audioTracks}
            current={c.audioIndex}
            onSelect={(i) => c.setAudio(i)}
            onBack={backToMenu}
          />
        ) : null}
        {view === 'audioFilter' ? (
          <AudioFilterPanel
            ref={subRef}
            value={c.audioFilter}
            onSelect={(m) => c.setAudioFilter(m)}
            onBack={backToMenu}
          />
        ) : null}
        {view === 'subtitles' ? (
          <SubtitlesPanel
            ref={subRef}
            subs={c.subtitles}
            current={c.subtitleIndex}
            onSelect={(i) => c.setSubtitle(i)}
            gen={subtitleGen}
            onBack={backToMenu}
          />
        ) : null}
        {view === 'appearance' ? (
          <SubtitleAppearancePanel
            ref={subRef}
            appearance={appearance}
            onAppearance={onAppearance}
            onBack={backToMenu}
          />
        ) : null}
        {view === 'report' && onReport ? (
          <ReportPanel ref={subRef} onReport={onReport} onBack={backToMenu} />
        ) : null}
        {view === 'speed' ? (
          <SpeedPanel
            ref={subRef}
            rate={c.rate}
            onSelect={(r) => c.setRate(r)}
            onBack={backToMenu}
          />
        ) : null}
      </ScrollView>
    </>
  );
});

/** The close X sits at the far end of the header, whatever the title's length. */
const CLOSE = { marginLeft: 'auto' as const };
