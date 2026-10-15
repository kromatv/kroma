import type { MediaItem } from '@kromatv/client/media';
import type { PlaybackMode } from '@kromatv/client/playback';
import type { MessageKey, TVars } from '@kromatv/i18n';
import { audioTracksOf, type CopyableAudio, copiesAsIs } from './audio-support';
import { capabilities, type PlaybackCapabilities } from './capabilities';

export interface StreamNotice {
  messageKey: MessageKey;
  messageVars?: TVars;
}

/**
 * What the player says about a stream that is not the original file, and null
 * for direct play: the absence of a notice is the signal that the bytes are
 * untouched. A compromise the player cannot name says nothing rather than
 * worrying a viewer with a blank.
 */
export function tracksNotice(
  tracks: readonly CopyableAudio[],
  mode: PlaybackMode,
  caps: PlaybackCapabilities = capabilities(),
): StreamNotice | null {
  if (mode === 'direct') return null;
  if (mode === 'remux') return { messageKey: 'player.repackaged' };
  const replaced = tracks.find((track) => !copiesAsIs(track, caps));
  if (!replaced?.codec) return null;
  return {
    messageKey: 'player.audioAdjusted',
    messageVars: { codec: replaced.codec.toUpperCase() },
  };
}

export function streamNotice(
  item: MediaItem,
  mode: PlaybackMode,
  caps: PlaybackCapabilities = capabilities(),
): StreamNotice | null {
  return tracksNotice(audioTracksOf(item), mode, caps);
}
