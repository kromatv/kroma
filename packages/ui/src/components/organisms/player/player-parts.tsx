// The slots a host fills. A part is a direct child of <Player.Root>, which walks
// them once and places each one itself: the chrome around them is the Root's.
//
// Two kinds, in a file each: a FACE ([`player-faces`]) renders its children where
// the Root puts them, a SETTING ([`player-settings`]) draws nothing and carries
// what the Root needs to draw that region.

import type { ReactNode } from 'react';
import { Children, isValidElement } from 'react';
import {
  Actions,
  Media,
  Panel,
  type PlayerActionsProps,
  type PlayerMediaProps,
  type PlayerPanelProps,
  type PlayerSubtitleProps,
  type PlayerTitleProps,
  type PlayerWarningProps,
  Subtitle,
  Title,
  Warning,
} from './player-faces';
import { PlayerScope } from './player-scope';
import {
  Credits,
  type PlayerCreditsProps,
  type PlayerPostPlayProps,
  type PlayerReportProps,
  type PlayerResumeProps,
  type PlayerSkipIntroProps,
  type PlayerSubtitlesProps,
  type PlayerTransportProps,
  type PlayerUpNextProps,
  PostPlay,
  Report,
  Resume,
  SkipIntro,
  Subtitles,
  Transport,
  UpNext,
} from './player-settings';

interface PlayerSlots {
  media: ReactNode;
  actions: ReactNode;
  panel: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  warning: ReactNode;
  transport?: PlayerTransportProps;
  upNext?: PlayerUpNextProps;
  credits?: PlayerCreditsProps;
  postPlay?: PlayerPostPlayProps;
  skipIntro?: PlayerSkipIntroProps;
  resume?: PlayerResumeProps;
  subtitles?: PlayerSubtitlesProps;
  report?: PlayerReportProps;
  rest: ReactNode[];
}

const FACES = new Map<unknown, keyof PlayerSlots>([
  [Media, 'media'],
  [Actions, 'actions'],
  [Panel, 'panel'],
  [Title, 'title'],
  [Subtitle, 'subtitle'],
  [Warning, 'warning'],
]);

const SETTINGS = new Map<unknown, keyof PlayerSlots>([
  [Transport, 'transport'],
  [UpNext, 'upNext'],
  [Credits, 'credits'],
  [PostPlay, 'postPlay'],
  [SkipIntro, 'skipIntro'],
  [Resume, 'resume'],
  [Subtitles, 'subtitles'],
  [Report, 'report'],
]);

function sortSlots(children: ReactNode): PlayerSlots {
  const at: PlayerSlots = {
    media: null,
    actions: null,
    panel: null,
    title: null,
    subtitle: null,
    warning: null,
    rest: [],
  };
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      if (child != null) at.rest.push(child);
      return;
    }
    const face = FACES.get(child.type);
    if (face) {
      at[face] = child as never;
      return;
    }
    const setting = SETTINGS.get(child.type);
    if (setting) {
      at[setting] = child.props as never;
      return;
    }
    at.rest.push(child);
  });
  return { ...at, rest: Children.toArray(at.rest) };
}

export type {
  PlayerActionsProps,
  PlayerCreditsProps,
  PlayerMediaProps,
  PlayerPanelProps,
  PlayerPostPlayProps,
  PlayerReportProps,
  PlayerResumeProps,
  PlayerSkipIntroProps,
  PlayerSubtitleProps,
  PlayerSubtitlesProps,
  PlayerTitleProps,
  PlayerTransportProps,
  PlayerUpNextProps,
  PlayerWarningProps,
};
export {
  Actions,
  Credits,
  Media,
  Panel,
  PlayerScope,
  PostPlay,
  Report,
  Resume,
  SkipIntro,
  Subtitle,
  Subtitles,
  sortSlots,
  Title,
  Transport,
  UpNext,
  Warning,
};
