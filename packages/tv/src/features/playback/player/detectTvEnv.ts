import type { PlayEnv } from '@kroma/core';
import { getTauri, mpvAvailable } from '#tv/features/playback/player/engine';

export function detectTvEnv(): PlayEnv {
  if (mpvAvailable()) return { platform: 'desktop', safari: false };
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  // Tauri on macOS is WKWebView (Safari engine: native HEVC + AC3/EAC3), so treating
  // it as Safari web matches the in-page <video> and spawns no second mpv window.
  if (getTauri() != null && /Mac|Macintosh/i.test(ua)) return { platform: 'web', safari: true };
  const webos = /web0?s/i.test(ua) || (globalThis as Record<string, unknown>).webOS !== undefined;
  const chromeMajor = Number(/Chrome\/(\d+)/i.exec(ua)?.[1]);
  return {
    platform: webos ? 'webos' : 'tizen',
    safari: false,
    // Legacy webOS engines (Chromium < 99, pre-2024 models) cannot decode HEVC
    // through MSE/hls.js; their native media pipeline plays the HLS master directly.
    nativeHls: webos && Number.isFinite(chromeMajor) && chromeMajor < 99,
  };
}
