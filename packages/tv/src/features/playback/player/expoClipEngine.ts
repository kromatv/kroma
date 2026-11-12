import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import type { ClipEngine } from '#tv/features/playback/player/clipBackend';
import type { EngineListeners } from '#tv/features/playback/player/engine';

const TIME_UPDATE_SEC = 0.25;

/** A clip on expo-video's platform player (AVPlayer on Apple TV, Media3 on
 * Android TV), opened once from its file and released with the engine. */
export class ExpoClipEngine implements ClipEngine {
  readonly player: VideoPlayer;
  private readonly listeners: EngineListeners;
  private readonly subscriptions: { remove(): void }[];
  private bufferedSec = 0;
  private durationSec = 0;

  constructor(url: string, listeners: EngineListeners) {
    const player = createVideoPlayer({ uri: url });
    player.timeUpdateEventInterval = TIME_UPDATE_SEC;
    this.player = player;
    this.listeners = listeners;
    this.subscriptions = [
      player.addListener('timeUpdate', ({ currentTime, bufferedPosition }) => {
        this.bufferedSec = bufferedPosition;
        listeners.onTime(currentTime);
        listeners.onBuffered(bufferedPosition);
        this.reportDuration();
      }),
      player.addListener('playingChange', ({ isPlaying }) => {
        if (isPlaying) listeners.onPlay();
        else listeners.onPause();
      }),
      player.addListener('statusChange', ({ status }) => {
        if (status === 'loading') listeners.onWaiting();
        if (status === 'error') listeners.onError();
        if (status !== 'readyToPlay') return;
        this.reportDuration();
        listeners.onPlaying();
        listeners.onReady();
      }),
      player.addListener('videoTrackChange', ({ videoTrack }) => {
        const size = videoTrack?.size;
        if (size && size.height > 0) listeners.onAspect?.(size.width / size.height);
      }),
      player.addListener('playToEnd', () => listeners.onEnded()),
    ];
    listeners.onSurfaceChange?.();
  }

  private reportDuration(): void {
    const total = this.player.duration;
    if (!Number.isFinite(total) || total <= 0 || total === this.durationSec) return;
    this.durationSec = total;
    this.listeners.onDuration(total);
  }

  play(): void {
    this.player.play();
  }
  pause(): void {
    this.player.pause();
  }
  isPaused(): boolean {
    return !this.player.playing;
  }
  position(): number {
    return this.player.currentTime;
  }
  duration(): number {
    return this.durationSec;
  }
  bufferedEnd(): number {
    return this.bufferedSec;
  }
  seekTo(sec: number): void {
    this.player.currentTime = sec;
  }
  setRate(rate: number): void {
    this.player.playbackRate = rate;
  }
  destroy(): void {
    for (const subscription of this.subscriptions) subscription.remove();
    try {
      this.player.pause();
      this.player.release();
    } catch {
      return;
    }
  }
}
