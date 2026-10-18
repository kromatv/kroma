import { type ReactNode, useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';
import { classes } from '#ui/lib/classed';
import { stepsReached } from './breakpoint-cascade';
import type { StyleRuntime } from './style-runtime';

// Flex is the fallback for the old browser tier, which ignores display:contents.
const HOST = StyleSheet.create({
  host: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%' },
}).host;
export function ThemeHost({
  runtime,
  themeScope = true,
  children,
}: Readonly<{ runtime: StyleRuntime; themeScope?: boolean; children?: ReactNode }>) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const host = useRef<HTMLDivElement>(null);
  const mode = useSyncExternalStore(runtime.onModeChange, runtime.mode, runtime.mode);
  const step = useSyncExternalStore(
    runtime.breakpoints.subscribe,
    runtime.breakpoints.index,
    runtime.breakpoints.index,
  );
  useLayoutEffect(() => {
    if (host.current && themeScope) return runtime.theme.attach(host.current, id);
  }, [runtime, id, themeScope]);
  return (
    <div
      ref={host}
      className={classes(HOST)}
      style={{ display: 'contents' }}
      data-kroma-theme={themeScope ? id : undefined}
      data-theme={!themeScope || mode === 'system' ? undefined : mode}
      data-kroma-bp={stepsReached(step)}
    >
      {children}
    </div>
  );
}
