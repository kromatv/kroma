import type { CastNowPlaying, CastNowWatching, CastReceiver } from '@kromatv/client/cast';
import { episodeTag } from './format';

export type CastShowing = CastNowPlaying | CastNowWatching;

export function castShowing(
  receiver: Pick<CastReceiver, 'nowPlaying' | 'nowWatching'> | null | undefined,
): CastShowing | null {
  return receiver?.nowPlaying ?? receiver?.nowWatching ?? null;
}

export function castShownTitle(showing: CastShowing): string {
  if ('item' in showing) return showing.item.metadata?.title ?? showing.item.title;
  const { title, season = null, episode = null } = showing.watch;
  return [title, episodeTag({ season, episode })].filter(Boolean).join(' · ');
}

export function castShowsEpisode(showing: CastShowing): boolean {
  if ('item' in showing) return showing.item.kind === 'episode';
  return showing.watch.season != null && showing.watch.episode != null;
}
