import {
  type RefObject,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { StyleSheet } from 'react-native';
import { classes } from '#ui/lib/classed';
import { stepsReached } from './breakpoint-cascade';
import { type ScopeMarks, ScopeMarksContext, useScopeMarks } from './scope-marks';
import type { ThemeHostProps } from './theme-host.types';

// Flex is the fallback for the old browser tier, which ignores display:contents.
const HOST = StyleSheet.create({
  host: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%' },
}).host;

function stampGround(page: HTMLElement, ground: 'light' | 'dark' | undefined): void {
  if (ground) {
    page.dataset.theme = ground;
  } else {
    delete page.dataset.theme;
  }
}

function stampScope(page: HTMLElement, scope: string): () => void {
  page.dataset.kromaTheme = scope;
  return () => {
    if (page.dataset.kromaTheme === scope) {
      delete page.dataset.kromaTheme;
    }
  };
}

interface DocumentMarks {
  outermost: boolean;
  ground: 'light' | 'dark' | undefined;
  scope: string | null;
}

function useDocumentMarks(host: RefObject<HTMLDivElement | null>, marks: DocumentMarks): void {
  const { outermost, ground, scope } = marks;
  useLayoutEffect(() => {
    const page = host.current?.ownerDocument.documentElement;
    if (outermost && page) {
      stampGround(page, ground);
    }
  }, [host, outermost, ground]);
  useLayoutEffect(() => {
    const page = host.current?.ownerDocument.documentElement;
    return outermost && page && scope ? stampScope(page, scope) : undefined;
  }, [host, outermost, scope]);
}

/** Stamps a styling root's theme, ground and breakpoint steps on an element of
 *  its own, and hands them to whatever renders outside it. The outermost root
 *  also keeps the document's ground and theme in step: `<html>` paints the
 *  canvas behind a short page and sets the scrollbars' scheme. */
export function ThemeHost({ runtime, themeScope = true, children }: Readonly<ThemeHostProps>) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const host = useRef<HTMLDivElement>(null);
  const parent = useScopeMarks();
  const mode = useSyncExternalStore(runtime.onModeChange, runtime.mode, runtime.serverMode);
  const step = useSyncExternalStore(
    runtime.breakpoints.subscribe,
    runtime.breakpoints.index,
    runtime.breakpoints.serverIndex,
  );
  const ground = !themeScope || mode === 'system' ? undefined : mode;
  const steps = stepsReached(step);
  const marks = useMemo<ScopeMarks>(
    () =>
      themeScope
        ? { 'data-kroma-theme': id, 'data-theme': ground, 'data-kroma-bp': steps }
        : { ...parent, 'data-kroma-bp': steps },
    [themeScope, id, ground, steps, parent],
  );
  useLayoutEffect(() => {
    if (host.current && themeScope) {
      return runtime.theme.attach(host.current, id);
    }
    return undefined;
  }, [runtime, id, themeScope]);
  useDocumentMarks(host, { outermost: parent === null, ground, scope: themeScope ? id : null });
  return (
    <div
      ref={host}
      className={classes(HOST)}
      style={{ display: 'contents' }}
      data-kroma-theme={themeScope ? id : undefined}
      data-theme={ground}
      data-kroma-bp={steps}
    >
      <ScopeMarksContext.Provider value={marks}>{children}</ScopeMarksContext.Provider>
    </div>
  );
}
