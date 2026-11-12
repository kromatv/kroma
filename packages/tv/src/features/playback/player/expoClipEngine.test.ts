import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeListeners } from './engine.fixture';
import { ExpoClipEngine } from './expoClipEngine';

const { players, FakePlayer } = vi.hoisted(() => {
  class FakePlayer {
    uri: string;
    currentTime = 0;
    duration = 0;
    playing = false;
    playbackRate = 1;
    timeUpdateEventInterval = 0;
    released = false;
    handlers = new Map<string, ((payload: never) => void)[]>();

    constructor(uri: string) {
      this.uri = uri;
    }

    play(): void {
      this.playing = true;
    }
    pause(): void {
      this.playing = false;
    }
    release(): void {
      this.released = true;
    }
    addListener(event: string, handler: (payload: never) => void): { remove(): void } {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return {
        remove: () =>
          this.handlers.set(
            event,
            (this.handlers.get(event) ?? []).filter((h) => h !== handler),
          ),
      };
    }
    emit(event: string, payload: unknown = {}): void {
      for (const handler of this.handlers.get(event) ?? []) handler(payload as never);
    }
  }
  return { players: [] as FakePlayer[], FakePlayer };
});

vi.mock('expo-video', () => ({
  createVideoPlayer: (source: { uri: string }) => {
    const player = new FakePlayer(source.uri);
    players.push(player);
    return player;
  },
}));

const TRAILER = 'http://kroma.test/api/trailers/tv/1399/KPLWWIOCOOQ/stream?t=tk';

const lastPlayer = () => players.at(-1) as InstanceType<typeof FakePlayer>;

afterEach(() => {
  players.length = 0;
});

describe('a clip on the platform player', () => {
  it('opens the file it was given as it is', () => {
    new ExpoClipEngine(TRAILER, fakeListeners());

    expect(lastPlayer().uri).toBe(TRAILER);
  });

  it('tells the surface its player is there to draw', () => {
    const listeners = fakeListeners();

    new ExpoClipEngine(TRAILER, listeners);

    expect(listeners.onSurfaceChange).toHaveBeenCalled();
  });

  it('is ready, with its length, once the player can play', () => {
    const listeners = fakeListeners();
    new ExpoClipEngine(TRAILER, listeners);
    lastPlayer().duration = 150;

    lastPlayer().emit('statusChange', { status: 'readyToPlay' });

    expect(listeners.onReady).toHaveBeenCalled();
    expect(listeners.onDuration).toHaveBeenCalledWith(150);
  });

  it('fails when the player cannot open the file', () => {
    const listeners = fakeListeners();
    new ExpoClipEngine(TRAILER, listeners);

    lastPlayer().emit('statusChange', { status: 'error' });

    expect(listeners.onError).toHaveBeenCalled();
  });

  it('reports the playhead and how far ahead it holds', () => {
    const listeners = fakeListeners();
    const engine = new ExpoClipEngine(TRAILER, listeners);

    lastPlayer().emit('timeUpdate', { currentTime: 12, bufferedPosition: 40 });

    expect(listeners.onTime).toHaveBeenCalledWith(12);
    expect(engine.bufferedEnd()).toBe(40);
  });

  it('draws the picture at the shape of its video track', () => {
    const listeners = fakeListeners();
    new ExpoClipEngine(TRAILER, listeners);

    lastPlayer().emit('videoTrackChange', { videoTrack: { size: { width: 1920, height: 800 } } });

    expect(listeners.onAspect).toHaveBeenCalledWith(2.4);
  });

  it('says it ended when the file runs out', () => {
    const listeners = fakeListeners();
    new ExpoClipEngine(TRAILER, listeners);

    lastPlayer().emit('playToEnd');

    expect(listeners.onEnded).toHaveBeenCalled();
  });

  it('pauses the player it opened', () => {
    const engine = new ExpoClipEngine(TRAILER, fakeListeners());
    engine.play();

    engine.pause();

    expect(engine.isPaused()).toBe(true);
  });

  it('seeks within the file', () => {
    const engine = new ExpoClipEngine(TRAILER, fakeListeners());

    engine.seekTo(30);

    expect(engine.position()).toBe(30);
  });

  it('plays at the rate it is asked for', () => {
    const engine = new ExpoClipEngine(TRAILER, fakeListeners());

    engine.setRate(1.25);

    expect(lastPlayer().playbackRate).toBe(1.25);
  });

  it('releases its player when it is destroyed', () => {
    const engine = new ExpoClipEngine(TRAILER, fakeListeners());

    engine.destroy();

    expect(lastPlayer().released).toBe(true);
  });

  it('hears nothing from its player once destroyed', () => {
    const listeners = fakeListeners();
    new ExpoClipEngine(TRAILER, listeners).destroy();

    lastPlayer().emit('playToEnd');

    expect(listeners.onEnded).not.toHaveBeenCalled();
  });
});
