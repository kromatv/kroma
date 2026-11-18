import type { AudioTrack } from '@kromatv/client/media';
import { nativeAudioPosition } from '@kromatv/core';
import type { VideoPlayer } from 'expo-video';

/**
 * The soundtrack of a file expo-video opens itself. The platform player lists
 * the file's tracks in its own order and can claim one plays before it does,
 * so the wanted track is asked for at every open and on every pick, a list
 * that arrives after the file is ready is waited for, and each call answers
 * false when the player lists the file's tracks without the wanted one.
 */
export class ExpoDirectAudio {
  private ask: 'at-ready' | 'on-list' | 'settled' = 'settled';

  constructor(private readonly tracks: readonly AudioTrack[]) {}

  /** A new source: a direct one is asked for once the player is ready. */
  opened(mode: 'direct' | 'master'): void {
    this.ask = mode === 'direct' ? 'at-ready' : 'settled';
  }

  ready(player: VideoPlayer, rendition: number): boolean {
    return this.ask !== 'at-ready' || this.select(player, rendition);
  }

  listed(player: VideoPlayer, rendition: number): boolean {
    return this.ask !== 'on-list' || this.select(player, rendition);
  }

  /** The viewer's pick, the one already playing included. */
  picked(player: VideoPlayer, rendition: number): boolean {
    return this.ask === 'at-ready' || this.select(player, rendition);
  }

  private select(player: VideoPlayer, rendition: number): boolean {
    const native = player.availableAudioTracks;
    if (this.tracks.length < 2) {
      this.ask = 'settled';
      return true;
    }
    if (native.length === 0) {
      this.ask = 'on-list';
      return true;
    }
    this.ask = 'settled';
    const at = nativeAudioPosition(this.tracks, rendition, native);
    const track = at === null ? undefined : native[at];
    if (!track) {
      return false;
    }
    player.audioTrack = track;
    return true;
  }
}
