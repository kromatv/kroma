// WHAT the settings menu offers, as data.
//
// One list, read top to bottom, instead of the conditionals it replaces: a row
// appears when the thing behind it exists (an engine picker only with more than
// one engine, an audio filter only where a DSP can deliver it, a report row only
// where the host takes reports). Nothing here renders or navigates - the panel
// does that - so this file answers exactly one question: what is in the menu,
// and what does each row say right now.

import type { MessageKey } from '@kroma/core';
import { langName } from '@kroma/core';
import type { ReactNode } from 'react';
import type { useT } from '#ui/services/i18n';
import { audioFilterLabels } from '../../../lib/audio-filter';
import type { ControlId } from '../../../lib/nav';
import type { PlayerController, PlayerSub } from '../../../types';
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
} from '../../icons';

type T = ReturnType<typeof useT>;

/** The sub-views the menu can open. `menu` is the list itself; the toggles
 *  (statistics) act in place and never become a view. */
export type View =
  | 'menu'
  | 'quality'
  | 'engine'
  | 'audio'
  | 'audioFilter'
  | 'subtitles'
  | 'appearance'
  | 'speed'
  | 'report';

/** One main-menu row: a sub-view to open, a switch to flip, or a control the
 *  transport row could not fit. */
export interface Entry {
  id: View | 'stats' | ControlId;
  icon: ReactNode;
  label: string;
  value?: ReactNode;
  toggle?: boolean;
  on?: boolean;
  activate: () => void;
}

// `audio`/`subtitles` are deliberately absent: the menu already lists both.
// Everything else the transport row can shed is here - `chromeMetrics` may drop
// a button precisely because this exists to catch it.
const MOVEABLE: Partial<Record<ControlId, { icon: ReactNode; label: MessageKey }>> = {
  next: { icon: <IconNext />, label: 'player.nextEpisode' },
  cast: { icon: <IconCast />, label: 'cast.moveToTv' },
  pip: { icon: <IconPip />, label: 'player.pip' },
  volume: { icon: <IconMute />, label: 'player.mute' },
  rewind: { icon: <IconBack10 />, label: 'player.back10' },
  forward: { icon: <IconFwd10 />, label: 'player.fwd10' },
};

/** The controls the transport row had no room for. Volume is a toggle because
 *  that is what activating it does (mute), not a sub-view. */
export function movedEntries(
  t: T,
  ids: readonly ControlId[],
  at: Readonly<{ muted: boolean; onControl?: (id: ControlId) => void }>,
): Entry[] {
  const run = at.onControl;
  if (!run) return [];
  return ids.flatMap((id) => {
    const row = MOVEABLE[id];
    if (!row) return [];
    return [
      {
        id,
        icon: row.icon,
        label: t(row.label),
        toggle: id === 'volume',
        on: id === 'volume' ? at.muted : undefined,
        activate: () => run(id),
      },
    ];
  });
}

function subtitleLabel(t: T, sub: PlayerSub | null | undefined): string {
  if (!sub) return t('player.subtitlesOff');
  if (sub.ai && sub.label) return sub.label;
  return langName(t, sub.language) || t('player.langUnknown');
}

/** Every setting the panel offers, in the order it is read. */
export function menuEntries(
  t: T,
  c: PlayerController,
  at: Readonly<{
    statsOn: boolean;
    onToggleStats: () => void;
    canReport: boolean;
    go: (view: View) => void;
  }>,
): Entry[] {
  const audio = c.audioTracks.find((a) => a.index === c.audioIndex);
  const sub = c.subtitleIndex == null ? null : c.subtitles.find((s) => s.index === c.subtitleIndex);
  return [
    {
      id: 'quality',
      icon: <IconQuality />,
      label: t('player.quality'),
      value: c.qualities.find((q) => q.id === c.qualityId)?.label,
      activate: () => at.go('quality'),
    },
    ...when(Boolean(c.engines?.length), {
      id: 'engine',
      icon: <IconGear />,
      label: t('playbackEngine.title'),
      value: c.engines?.find((e) => e.id === c.engineId)?.label,
      activate: () => at.go('engine'),
    }),
    {
      id: 'audio',
      icon: <IconAudioTrack />,
      label: t('player.audioTrack'),
      value: audio
        ? audio.title?.trim() || langName(t, audio.language) || t('player.langUnknown')
        : undefined,
      activate: () => at.go('audio'),
    },
    ...when(c.audioFilterSupported, {
      id: 'audioFilter',
      icon: <IconAudioFilter />,
      label: t('player.audioFilters'),
      value: audioFilterLabels(t)[c.audioFilter],
      activate: () => at.go('audioFilter'),
    }),
    {
      id: 'subtitles',
      icon: <IconSubtitles />,
      label: t('player.subtitles'),
      value: subtitleLabel(t, sub),
      activate: () => at.go('subtitles'),
    },
    {
      id: 'appearance',
      icon: <IconAppearance />,
      label: t('player.subAppearance'),
      activate: () => at.go('appearance'),
    },
    {
      id: 'speed',
      icon: <IconSpeed />,
      label: t('player.speed'),
      value: c.rate === 1 ? t('player.normalSpeed') : `${c.rate}×`,
      activate: () => at.go('speed'),
    },
    {
      id: 'stats',
      icon: <IconStats />,
      label: t('player.stats'),
      toggle: true,
      on: at.statsOn,
      activate: at.onToggleStats,
    },
    // Last on purpose: the row nobody wants to need, and the one that must be
    // there when they do.
    ...when(at.canReport, {
      id: 'report',
      icon: <IconReport />,
      label: t('report.action'),
      activate: () => at.go('report'),
    }),
  ];
}

/** The panel's title: the menu's own, or the row that opened the sub-view. */
export function panelTitle(view: View, entries: readonly Entry[], t: T): string {
  if (view === 'menu') return t('player.settings');
  return entries.find((e) => e.id === view)?.label ?? '';
}

// A row that is only there sometimes, without a ternary around every one.
function when(present: boolean, entry: Entry): Entry[] {
  return present ? [entry] : [];
}
