import { type ThemeMode, useStyleRuntime, writeMode } from '@kromatv/ui/kit';
import { useSyncExternalStore } from 'react';

/** The theme mode in force, and a way to choose another that persists as the header's switch does. */
export function useThemeMode(): { mode: ThemeMode; choose: (mode: ThemeMode) => void } {
  const runtime = useStyleRuntime();
  const mode = useSyncExternalStore(runtime.onModeChange, runtime.mode, runtime.serverMode);
  return { mode, choose: (next) => writeMode(next, runtime) };
}
