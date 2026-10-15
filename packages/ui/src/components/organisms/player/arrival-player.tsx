import type { CapabilitySource } from '@kromatv/client/capabilities';
import type { WatchableProgress } from '@kromatv/client/watchable';
import { arrivalOf, downloadedSpans } from '@kromatv/core';
import { type ReactNode, useMemo } from 'react';
import { useLocale, useT } from '#ui/services/i18n';
import { withArrivalStats } from './lib/arrival-stats';
import { useSubtitleAppearance } from './lib/subtitle-appearance';
import { Player } from './player';
import type { PlayerCloseDetails, PlayerController, PlayerFlags } from './types';

export interface ArrivalPlayerProps {
  controller: PlayerController;
  flags: PlayerFlags;
  title: string;
  release?: string | null;
  /** How much of the file has arrived, null until the source first answers. */
  progress: WatchableProgress | null;
  /** Null reads the payload as the figures a download reported before a source
   *  could name its own. */
  source?: CapabilitySource | null;
  /** Hands the file to a television; the button shows only with `flags.cast`. */
  onCast?: () => void;
  onClose: (details: PlayerCloseDetails) => void;
  /** The parts, `<Player.Media>` among them. Written after this component's
   *  own, so a host that writes a face twice wins. */
  children: ReactNode;
}

/**
 * The chrome over a file that has not finished arriving: the ordinary player,
 * told what is still coming in. The next episode (`Player.Credits`,
 * `Player.UpNext`) and the stop panel are the host's to write as children.
 */
function ArrivalPlayer({
  controller,
  flags,
  title,
  release = null,
  progress,
  source = null,
  onCast,
  onClose,
  children,
}: Readonly<ArrivalPlayerProps>) {
  const t = useT();
  const locale = useLocale();
  const [appearance, onAppearanceChange] = useSubtitleAppearance();
  const { dur } = controller;
  const arrival = useMemo(
    () => arrivalOf({ source, progress, t, locale }),
    [source, progress, t, locale],
  );
  const downloaded = useMemo(
    () => (arrival.slices.length > 0 ? downloadedSpans(arrival.slices, dur) : undefined),
    [arrival, dur],
  );
  const getStats = () => withArrivalStats({ base: controller.getStats(), arrival, t });

  return (
    <Player.Root
      controller={{ ...controller, downloaded, getStats }}
      flags={flags}
      title={title}
      onCast={onCast}
      onClose={onClose}
    >
      <Player.Title>{title}</Player.Title>
      {release ? <Player.Subtitle>{release}</Player.Subtitle> : null}
      <Player.Arrival arrival={arrival} />
      <Player.Subtitles appearance={appearance} onAppearanceChange={onAppearanceChange} />
      {children}
    </Player.Root>
  );
}

export { ArrivalPlayer };
