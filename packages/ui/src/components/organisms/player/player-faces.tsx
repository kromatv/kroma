// The parts that render their children where the Root puts them. A wrapper here
// would put an element between the stage and the <video> the injected stylesheet
// sizes (lib/styles), so each one renders its children bare.

import type { ReactNode } from 'react';
import { useSlot } from './player-scope';

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

export type {
  PlayerActionsProps,
  PlayerMediaProps,
  PlayerPanelProps,
  PlayerSubtitleProps,
  PlayerTitleProps,
  PlayerWarningProps,
};
export { Actions, Media, Panel, Subtitle, Title, Warning };
