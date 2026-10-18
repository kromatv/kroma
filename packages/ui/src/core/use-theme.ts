import {
  createElement,
  Fragment,
  type ReactElement,
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { Appearance, AppState } from 'react-native';
import { useDeviceStore } from '#ui/lib/device-store';
import { StyleRuntimeContext, useStyleRuntime, useStyleRuntimeParent } from './style-context';
import { createStyleRuntime, type StyleRuntime } from './style-runtime';
import { KROMA, type Theme } from './theme';
import { ThemeHost } from './theme-host';
import { readMode } from './theme-mode';

const EMPTY_SUBSCRIBE = () => () => {};
const DEFAULT_THEME = () => KROMA;
const ZERO = () => 0;

/** The theme snapshot of this styling root. */
export function useTheme(): Theme {
  const theme = useStyleRuntimeParent()?.theme;
  return useSyncExternalStore(
    theme?.onThemeChange ?? EMPTY_SUBSCRIBE,
    theme?.activeTheme ?? DEFAULT_THEME,
    theme?.activeTheme ?? DEFAULT_THEME,
  );
}
export function useThemeVersion(): number {
  const theme = useStyleRuntimeParent()?.theme;
  return useSyncExternalStore(
    theme?.onThemeChange ?? EMPTY_SUBSCRIBE,
    theme?.themeVersion ?? ZERO,
    theme?.themeVersion ?? ZERO,
  );
}
export function useThemeControls() {
  return useStyleRuntime().theme;
}

/** Follow native appearance for this root while its stored choice is system. */
export function useSystemGround(): void {
  const runtime = useStyleRuntime();
  const storage = useDeviceStore();
  useEffect(() => {
    const follow = () => {
      if (readMode(undefined, storage) === 'system') runtime.setMode('system');
    };
    const watch = Appearance.addChangeListener(follow);
    const wake = AppState.addEventListener('change', (state) => {
      if (state === 'active') follow();
    });
    return () => {
      watch.remove();
      wake.remove();
    };
  }, [runtime, storage]);
}

/** An explicit theme owns a nested scope; inherited scopes remount on its version. */
export function ThemeProvider({
  theme,
  children,
}: Readonly<{ theme?: Theme; children?: ReactNode }>): ReactElement {
  const parent = useStyleRuntimeParent();
  return theme !== undefined || !parent
    ? createElement(OwnedThemeProvider, { theme, parent: parent ?? undefined }, children)
    : createElement(InheritedThemeProvider, { runtime: parent }, children);
}
function InheritedThemeProvider({
  runtime,
  children,
}: Readonly<{ runtime: StyleRuntime; children?: ReactNode }>): ReactElement {
  const version = useSyncExternalStore(
    runtime.theme.onThemeChange,
    runtime.theme.themeVersion,
    runtime.theme.themeVersion,
  );
  return createElement(Fragment, { key: version }, children);
}
function OwnedThemeProvider({
  theme,
  parent,
  children,
}: Readonly<{ theme?: Theme; parent?: StyleRuntime; children?: ReactNode }>): ReactElement {
  const [runtime] = useState(() => createStyleRuntime({ theme }, parent));
  const version = useSyncExternalStore(
    runtime.theme.onThemeChange,
    runtime.theme.themeVersion,
    runtime.theme.themeVersion,
  );
  useEffect(() => {
    if (theme) runtime.theme.setTheme(theme);
  }, [runtime, theme]);
  useEffect(() => runtime.breakpoints.retain(), [runtime]);
  return createElement(
    StyleRuntimeContext.Provider,
    { value: runtime },
    createElement(ThemeHost, { runtime }, createElement(Fragment, { key: version }, children)),
  );
}
