// The slots a host fills. A part is a direct child of <Player.Root>, which walks
// them once and places each one itself: the chrome around them is the Root's,
// and a wrapper here would put an element between the stage and the <video> the
// injected stylesheet sizes (lib/styles).
//
// Two kinds. A FACE renders its children where the Root puts them. A SETTING
// draws nothing and carries what the Root needs to draw that region, because the
// region is the Root's own furniture: a transport row a caller could rearrange
// would break D-pad traversal (DESIGN.md §3, T5).

import { Children, createContext, isValidElement, type ReactNode, useContext } from 'react';
import type { StoryboardTile } from '#ui/services/storyboard';
import type { SubtitleAppearance } from './lib/subtitle-appearance';
import type { PlayerMarker, PlayerReportCategory } from './media-types';
import type { CreditsCardItem } from './parts/credits-card';
import type { PostPlayItem } from './parts/post-play';
import type { SubtitleGenBundle } from './parts/settings-panel/settings/gen';
import type { UpNextData, UpNextItem } from './parts/up-next-sheet';
import type { Chapter } from './types';

const PlayerSlotContext = createContext(false);

function useSlot(part: string): void {
  const inRoot = useContext(PlayerSlotContext);
  if (!inRoot) throw new Error(`<Player.${part}> must be a direct child of <Player.Root>`);
}

interface PlayerMediaProps {
  /** The surface the controller drives: an in-page `<video>`, or the placeholder
   *  a native plane draws behind. It rounds ITSELF (see `useSurfaceRadius`); a
   *  rounded parent does not clip a hardware video layer. */
  children: ReactNode;
}

/** The picture, under the whole chrome. */
function Media({ children }: Readonly<PlayerMediaProps>) {
  useSlot('Media');
  return <>{children}</>;
}

interface PlayerActionsProps {
  children: ReactNode;
}

/** The host's own controls, at the end of the top bar beside the warning pill
 *  (the web's "play on TV"). A television passes none: it is the screen a film
 *  is cast TO. */
function Actions({ children }: Readonly<PlayerActionsProps>) {
  useSlot('Actions');
  return <>{children}</>;
}

interface PlayerPanelProps {
  children: ReactNode;
}

/** A region that takes the stage over: the "an admin stopped this" notice. While
 *  one is mounted the chrome is locked: the picture stops taking presses, the
 *  buffering spinner stays down, and only Back / OK get through, both meaning
 *  leave. */
function Panel({ children }: Readonly<PlayerPanelProps>) {
  useSlot('Panel');
  return <>{children}</>;
}

interface PlayerTitleProps {
  children: ReactNode;
}

/** What is playing, at the top left. `<Player.Root title>` is the same words as
 *  a name for assistive tech and for the end card; this is what draws them. */
function Title({ children }: Readonly<PlayerTitleProps>) {
  useSlot('Title');
  return <>{children}</>;
}

interface PlayerSubtitleProps {
  children: ReactNode;
}

/** The line under the title: an episode number, a year. */
function Subtitle({ children }: Readonly<PlayerSubtitleProps>) {
  useSlot('Subtitle');
  return <>{children}</>;
}

interface PlayerWarningProps {
  children: ReactNode;
}

/** A pill in the top bar for something the viewer should know about this
 *  playback: a transcode, a fallback engine. Write none and none is drawn. */
function Warning({ children }: Readonly<PlayerWarningProps>) {
  useSlot('Warning');
  return <>{children}</>;
}

interface PlayerTransportProps {
  /** Chapter stops on the scrub bar. */
  chapters?: Chapter[];
  /** The storyboard tile under the scrub head, by second. */
  tileAt: (sec: number) => StoryboardTile | null;
}

/** The scrub bar and the control row. Written to give it a storyboard and
 *  chapters; the row itself is the Root's, which sheds controls a narrow stage
 *  has no room for and keeps the D-pad order honest. */
function Transport(_: Readonly<PlayerTransportProps>) {
  useSlot('Transport');
  return null;
}

interface PlayerUpNextProps {
  data: UpNextData;
  onPlay?: (item: UpNextItem) => void;
}

/** The peeking sheet of what to watch next. */
function UpNext(_: Readonly<PlayerUpNextProps>) {
  useSlot('UpNext');
  return null;
}

interface PlayerCreditsProps {
  /** Where the film's intro and credits are, so the card knows when to rise. */
  markers?: readonly PlayerMarker[];
  /** The episode the card offers. */
  next?: CreditsCardItem | null;
  /** Given one, the chrome also grows a "next" control. */
  onPlay?: () => void;
}

/** The card that offers the next episode over the closing credits. */
function Credits(_: Readonly<PlayerCreditsProps>) {
  useSlot('Credits');
  return null;
}

interface PlayerPostPlayProps {
  /** The film offered when this one ends with no next episode queued. With none
   *  the player leaves instead of parking on a dead frame. */
  item: PostPlayItem | null;
  /** Where the second action goes. Falls back to `<Player.Root onClose>`. */
  onHome?: () => void;
}

/** The full-screen offer at the end of the film. */
function PostPlay(_: Readonly<PlayerPostPlayProps>) {
  useSlot('PostPlay');
  return null;
}

interface PlayerSkipIntroProps {
  /** Whether the film is inside its detected intro window. The pill is only
   *  offered while this is true. */
  active?: boolean;
  onSkip: () => void;
}

/** The skip pill, over the bottom right of the stage. */
function SkipIntro(_: Readonly<PlayerSkipIntroProps>) {
  useSlot('SkipIntro');
  return null;
}

interface PlayerSubtitlesProps {
  appearance: SubtitleAppearance;
  onAppearanceChange: (next: Partial<SubtitleAppearance>) => void;
  /** Everything the panel needs to drive generation. */
  gen: SubtitleGenBundle;
}

/** The subtitles half of the settings panel: the picked track, how it looks, and
 *  generating a new one. */
function Subtitles(_: Readonly<PlayerSubtitlesProps>) {
  useSlot('Subtitles');
  return null;
}

interface PlayerReportProps {
  onReport: (category: PlayerReportCategory) => Promise<void>;
}

/** Reporting a problem with what is playing. The settings menu grows the row
 *  only when this is written, so a surface with its own flow is unaffected. */
function Report(_: Readonly<PlayerReportProps>) {
  useSlot('Report');
  return null;
}

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
  PlayerSlotContext,
  PostPlay,
  Report,
  SkipIntro,
  Subtitle,
  Subtitles,
  sortSlots,
  Title,
  Transport,
  UpNext,
  Warning,
};
