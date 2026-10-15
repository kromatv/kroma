// The parts that draw nothing and carry what the Root needs to draw that region,
// because the region is the Root's own furniture: a transport row a caller could
// rearrange would break D-pad traversal (DESIGN.md §3, T5).

import type { Arrival } from '@kromatv/core';
import type { StoryboardTile } from '#ui/services/storyboard';
import type { SubtitleAppearance } from './lib/subtitle-appearance';
import type { PlayerMarker, PlayerReportCategory } from './media-types';
import type { CreditsCardItem } from './parts/credits-card';
import type { PostPlayItem } from './parts/post-play';
import type { SubtitleGenBundle } from './parts/settings-panel/settings/gen';
import type { UpNextData, UpNextItem } from './parts/up-next-sheet';
import { useSlot } from './player-scope';
import type { Chapter } from './types';

interface PlayerArrivalProps {
  arrival: Arrival;
}

/** How much of the file has arrived, at the head of the top bar's right cluster. */
function ArrivalSlot(_: Readonly<PlayerArrivalProps>) {
  useSlot('Arrival');
  return null;
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

interface PlayerResumeProps {
  /** The second playback opened on. Write the slot only where a film really did
   *  resume. */
  at: number;
}

/** The prompt that says a film opened where it was left, and offers the way back
 *  to the beginning. It leaves on its own. */
function Resume(_: Readonly<PlayerResumeProps>) {
  useSlot('Resume');
  return null;
}

interface PlayerSubtitlesProps {
  appearance: SubtitleAppearance;
  onAppearanceChange: (next: Partial<SubtitleAppearance>) => void;
  /** Everything the panel needs to drive generation. Written none, the panel
   *  offers no way to make a track. */
  gen?: SubtitleGenBundle;
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

export type {
  PlayerArrivalProps,
  PlayerCreditsProps,
  PlayerPostPlayProps,
  PlayerReportProps,
  PlayerResumeProps,
  PlayerSkipIntroProps,
  PlayerSubtitlesProps,
  PlayerTransportProps,
  PlayerUpNextProps,
};
export { ArrivalSlot, Credits, PostPlay, Report, Resume, SkipIntro, Subtitles, Transport, UpNext };
