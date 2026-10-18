import type { DeviceStore } from '#ui/lib/device-store';
import { type BreakpointRuntime, createBreakpointRuntime } from './breakpoint';
import type { StyleScope } from './style-scope';
import { createThemeRuntime, KROMA, KROMA_LIGHT, type Theme, type ThemeRuntime } from './theme';
import { readMode, resolveMode, type ThemeMode } from './theme-mode';
import { CSS_COLORS } from './tokens/css-palette';

export interface StyleRuntime extends StyleScope {
  readonly theme: ThemeRuntime;
  readonly breakpoints: BreakpointRuntime;
  styleScope(): StyleScope;
  mode(): ThemeMode;
  /** The mode a server renders with: it reads no visitor storage, so only a
   *  configured ground reaches it. What hydration must match. */
  serverMode(): ThemeMode;
  setMode(mode: ThemeMode): void;
  onModeChange(listener: () => void): () => void;
}
export interface StyleRuntimeOptions {
  theme?: Theme;
  ground?: ThemeMode;
  designWidth?: number;
  deviceStore?: DeviceStore | null;
}

/** One app or an explicit nested theme/width scope owns these stores. */
export function createStyleRuntime(
  options: StyleRuntimeOptions = {},
  parent?: StyleRuntime,
): StyleRuntime {
  let mode = options.ground ?? parent?.mode() ?? readMode(undefined, options.deviceStore);
  const rendered = options.ground ?? parent?.serverMode() ?? 'system';
  const ownsTheme = !parent || options.theme !== undefined || options.ground !== undefined;
  const initial =
    options.theme ?? (!CSS_COLORS && resolveMode(mode) === 'light' ? KROMA_LIGHT : KROMA);
  const inheritedTheme = parent && !ownsTheme ? parent : undefined;
  const theme = inheritedTheme ? inheritedTheme.theme : createThemeRuntime(initial);
  const breakpoints =
    options.designWidth !== undefined || !parent
      ? createBreakpointRuntime(options.designWidth)
      : parent.breakpoints;
  const listeners = new Set<() => void>();
  let scopeAt = -1;
  let snapshot: StyleScope = { theme, breakpoints };
  return {
    theme,
    breakpoints,
    styleScope() {
      const at = theme.themeVersion();
      if (scopeAt !== at) {
        snapshot = Object.freeze({ theme, breakpoints });
        scopeAt = at;
      }
      return snapshot;
    },
    mode: inheritedTheme ? inheritedTheme.mode : () => mode,
    serverMode: inheritedTheme ? inheritedTheme.serverMode : () => rendered,
    setMode(next) {
      if (inheritedTheme) {
        inheritedTheme.setMode(next);
        return;
      }
      mode = next;
      if (!CSS_COLORS) theme.setTheme(resolveMode(next) === 'light' ? KROMA_LIGHT : KROMA);
      for (const listener of listeners) listener();
    },
    onModeChange: inheritedTheme
      ? inheritedTheme.onModeChange
      : (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
  };
}
