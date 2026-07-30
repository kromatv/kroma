// Input-environment capabilities for the shared TV app: the same bundle runs
// on d-pad TVs (Tizen / webOS / Android TV) and on the desktop shell (mouse +
// keyboard, or a Steam Deck gamepad). `mousePointer` and `physicalKeyboard` are
// keyed off the explicit platform label, not the pointer media query alone: a
// webOS magic remote reports `(pointer: fine)` yet has no keyboard and emits
// phantom pointermove events.

import { isTizenRuntime, isWebOsRuntime } from '@kroma/core';
import { webWindow } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';

export interface TvEnv {
  platform: string;
  mousePointer: boolean;
  physicalKeyboard: boolean;
}

// Overrides a shell may pass when the platform label alone is wrong (e.g. a
// Steam Deck is 'Desktop' but gamepad-driven, so `physicalKeyboard:false`).
export interface TvEnvOverrides {
  pointer?: boolean;
  physicalKeyboard?: boolean;
}

function finePointer(): boolean {
  try {
    // biome-ignore lint/style/noRestrictedGlobals: audited - the typeof guard is the point; a TV without matchMedia reports no fine pointer, which is correct.
    return typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
  } catch {
    return false;
  }
}

// webOS UA has two spellings and a global bridge, handled by @kroma/core;
// Android TV is a plain Android webview, so its UA is all there is to go on.
const TV_RUNTIME: Record<string, (ua: string) => boolean> = {
  Tizen: isTizenRuntime,
  webOS: isWebOsRuntime,
  'Android TV': (ua) => /android/i.test(ua),
};

// True only when a TV-shell build is really running on its TV: a Tizen bundle
// previewed in desktop Chrome (the dev shell) has no "Tizen" UA.
function onRealTv(platform: string): boolean {
  // Native clients have no DOM at all, so they must short-circuit here: without
  // it, tvOS reported a hardware keyboard and broke the PIN screen, whose input
  // listener is DOM-only.
  if (!webWindow()) return true;
  const probe = TV_RUNTIME[platform];
  if (!probe) return false;
  try {
    return probe(navigator.userAgent);
  } catch {
    return true; // no navigator: assume the TV, keep the OSK
  }
}

export function computeEnv(platform: string, overrides: TvEnvOverrides = {}): TvEnv {
  const pointer = overrides.pointer ?? finePointer();
  return {
    platform,
    // A TV magic remote is a fine pointer too, but must not drive pointer-move UX.
    mousePointer: pointer && platform === 'Desktop',
    physicalKeyboard: overrides.physicalKeyboard ?? !onRealTv(platform),
  };
}

// The value seen when no <EnvProvider> is mounted. Built through computeEnv so
// it can't drift from the real derivation; the overrides bias an unknown host
// toward a remote-driven TV rather than `computeEnv('TV')`'s dev-preview default.
const EnvContext = createContext<TvEnv>(
  computeEnv('TV', { pointer: false, physicalKeyboard: false }),
);

export function EnvProvider({
  platform,
  overrides,
  children,
}: Readonly<{ platform: string; overrides?: TvEnvOverrides; children: ReactNode }>) {
  const value = useMemo(() => computeEnv(platform, overrides), [platform, overrides]);
  return <EnvContext.Provider value={value}>{children}</EnvContext.Provider>;
}

export function useEnv(): TvEnv {
  return useContext(EnvContext);
}
