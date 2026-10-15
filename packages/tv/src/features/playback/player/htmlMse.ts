import { attachHlsRecovery, type BufferPlan, hlsBufferConfig, shakaConfig } from '@kromatv/core';

type HlsInstance = import('hls.js').default;

/** The slice of the Shaka Player API this engine touches, typed structurally so
 * Shaka's generated namespace types stay out of the program (the web client's
 * video-engine does the same). */
export interface ShakaPlayerLike {
  attach(media: HTMLMediaElement): Promise<void>;
  load(uri: string, startTime?: number | null): Promise<void>;
  destroy(): Promise<void>;
  configure(config: Record<string, unknown>): boolean;
  retryStreaming(retryDelaySeconds?: number): boolean;
}

interface ShakaStatic {
  Player: { new (): ShakaPlayerLike; isBrowserSupported(): boolean };
  polyfill: { installAll(): void };
}

export interface MseMasterOptions {
  video: HTMLVideoElement;
  url: string;
  fromSec: number;
  plan: BufferPlan;
  shaka: boolean;
  stale(): boolean;
  onShaka(player: ShakaPlayerLike): void;
  onHls(hls: HlsInstance): void;
  onGiveUp(): void;
  onNative(): void;
}

/**
 * Play an anchored master through MSE and hand the instance back, so the engine
 * can drive and destroy it. `fromSec` is the stream's own clock, not the film's.
 * An engine that ships neither library is handed back to `onNative`.
 */
export function attachMseMaster(opts: Readonly<MseMasterOptions>): void {
  if (opts.shaka) {
    attachShaka(opts);
    return;
  }
  attachHls(opts);
}

function attachShaka(opts: Readonly<MseMasterOptions>): void {
  // Spelled inline (not shakaAvailable()) so the legacy IIFE build, which
  // defines the global and inlines dynamic imports, folds this to `if (true)`
  // and drops the unreachable import below: Shaka never reaches a bundle
  // whose engines cannot run it.
  if ((globalThis as { __KROMA_LEGACY_TIER__?: boolean }).__KROMA_LEGACY_TIER__) {
    attachHls(opts);
    return;
  }
  void import('shaka-player/dist/shaka-player.compiled.js').then((mod) => {
    if (opts.stale()) return;
    const shaka = (mod as unknown as { default: ShakaStatic }).default;
    shaka.polyfill.installAll();
    // A TV Chromium Shaka rejects still plays the same master through hls.js.
    if (!shaka.Player.isBrowserSupported()) {
      attachHls(opts);
      return;
    }
    const player = new shaka.Player();
    opts.onShaka(player);
    player.configure(shakaConfig(opts.plan));
    player
      .attach(opts.video)
      .then(() => player.load(opts.url, opts.fromSec))
      .catch(() => undefined);
  });
}

function attachHls(opts: Readonly<MseMasterOptions>): void {
  void import('hls.js').then(({ default: Hls }) => {
    if (opts.stale()) return;
    if (!Hls.isSupported()) {
      opts.onNative();
      return;
    }
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      startPosition: opts.fromSec,
      ...hlsBufferConfig(opts.plan),
    });
    opts.onHls(hls);
    attachHlsRecovery(Hls, hls, opts.onGiveUp);
    hls.loadSource(opts.url);
    hls.attachMedia(opts.video);
  });
}
