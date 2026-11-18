interface Sub {
  event: string;
  handler: (payload: unknown) => void;
  removed: boolean;
}

/** A stand-in for expo-video's player that records what the engine asks of it. */
export class FakeVideoPlayer {
  uri: string;
  currentTime = 0;
  timeUpdateEventInterval = 0;
  availableAudioTracks: { id: string; language?: string | null }[] = [];
  claimed: unknown = null;
  asked: unknown[] = [];
  bufferOptions: unknown = null;
  plays = 0;
  pauses = 0;
  released = false;
  replaced: string[] = [];
  replaceThrows = false;
  throwOnRead = false;
  subs: Sub[] = [];
  private durationValue = 0;
  private bufferedValue = 0;

  constructor(uri: string) {
    this.uri = uri;
  }

  get audioTrack(): unknown {
    return this.claimed;
  }
  set audioTrack(value: unknown) {
    this.claimed = value;
    this.asked.push(value);
  }
  get duration(): number {
    if (this.throwOnRead) {
      throw new Error('native shared object released');
    }
    return this.durationValue;
  }
  set duration(value: number) {
    this.durationValue = value;
  }
  get bufferedPosition(): number {
    if (this.throwOnRead) {
      throw new Error('native shared object released');
    }
    return this.bufferedValue;
  }
  set bufferedPosition(value: number) {
    this.bufferedValue = value;
  }

  play(): void {
    this.plays += 1;
  }
  pause(): void {
    this.pauses += 1;
  }
  release(): void {
    this.released = true;
  }
  replace(source: { uri: string }): void {
    if (this.replaceThrows) {
      throw new Error('will not take a new source');
    }
    this.uri = source.uri;
    this.replaced.push(source.uri);
  }
  addListener(event: string, handler: (payload: unknown) => void): { remove(): void } {
    const sub: Sub = { event, handler, removed: false };
    this.subs.push(sub);
    return {
      remove: () => {
        sub.removed = true;
      },
    };
  }
  emit(event: string, payload: unknown = {}): void {
    for (const sub of this.subs) {
      if (sub.event === event && !sub.removed) {
        sub.handler(payload);
      }
    }
  }
  emitStale(event: string, payload: unknown = {}): void {
    for (const sub of this.subs) {
      if (sub.event === event) {
        sub.handler(payload);
      }
    }
  }
}

/** Every player the fake `createVideoPlayer` handed out, oldest first. */
export const players: FakeVideoPlayer[] = [];

export function fakeCreateVideoPlayer(source: { uri: string }): FakeVideoPlayer {
  const player = new FakeVideoPlayer(source.uri);
  players.push(player);
  return player;
}
