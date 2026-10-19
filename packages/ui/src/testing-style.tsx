import {
  type RenderHookOptions,
  type RenderHookResult,
  type RenderOptions,
  type RenderResult,
  renderHook as renderReactHook,
  render as renderTree,
} from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import {
  breakpointIndex as readBreakpoint,
  currentBreakpoint as readCurrentBreakpoint,
} from './core/breakpoint';
import { color as resolveColor } from './core/color';
import { normalize as normalizeDecl } from './core/normalize';
import { bindRecipe, sv as defineRecipe } from './core/recipe';
import { boxStyle as resolveBox, textStyle as resolveText } from './core/shorthand-resolve';
import { StyleRuntimeProvider } from './core/style-context';
import {
  createStyleRuntime,
  type StyleRuntime,
  type StyleRuntimeOptions,
} from './core/style-runtime';
import {
  styles as defineStyles,
  sharedStyle as resolveSharedStyle,
  type Styles,
} from './core/styles';
import {
  themedCache as memoCache,
  themed as memoTheme,
  onPaper as paper,
  radiusValue as radius,
  scaledRadius as scaled,
  groundShade as shade,
} from './core/theme';
import {
  applyMode as applyGround,
  type ThemeMode,
  writeMode as writeGround,
} from './core/theme-mode';
import type { StyleDecl } from './core/types';
import { KitSettingsContext, useKitSettings } from './lib/kit-settings';

export interface StyleTestHost {
  runtime: StyleRuntime;
  Host(props: Readonly<{ children?: ReactNode }>): ReactNode;
  render(ui: ReactNode, options?: RenderOptions): RenderResult;
  renderHook<Result, Props>(
    callback: (props: Props) => Result,
    options?: RenderHookOptions<Props>,
  ): RenderHookResult<Result, Props>;
  setTheme: StyleRuntime['theme']['setTheme'];
  applyTheme: StyleRuntime['theme']['applyTheme'];
  activeTheme: StyleRuntime['theme']['activeTheme'];
  themeVersion: StyleRuntime['theme']['themeVersion'];
  onThemeChange: StyleRuntime['theme']['onThemeChange'];
  pinDesignWidth: StyleRuntime['breakpoints']['pinDesignWidth'];
  currentBreakpoint(): ReturnType<typeof readCurrentBreakpoint>;
  breakpointIndex(): number;
  styles<const S extends Record<string, StyleDecl>>(decls: S): Styles<S>;
  sv: typeof defineRecipe;
  color: typeof resolveColor;
  normalize: typeof normalizeDecl;
  boxStyle: typeof resolveBox;
  textStyle: typeof resolveText;
  sharedStyle: typeof resolveSharedStyle;
  groundShade: typeof shade;
  onPaper: typeof paper;
  radiusValue: typeof radius;
  scaledRadius: typeof scaled;
  themed: typeof memoTheme;
  themedCache: typeof memoCache;
  applyMode(mode: ThemeMode): void;
  writeMode(mode: ThemeMode): void;
}

/** A test owns the same style stores as its rendered root; no process-wide setters. */
export function createStyleTestHost(options: StyleRuntimeOptions = {}): StyleTestHost {
  const runtime = createStyleRuntime({ ground: 'system', ...options });
  function Host({ children }: Readonly<{ children?: ReactNode }>) {
    const parent = useKitSettings();
    const settings = {
      ...parent,
      deviceStore: options.deviceStore === undefined ? parent.deviceStore : options.deviceStore,
    };
    return createElement(
      KitSettingsContext.Provider,
      { value: settings },
      createElement(StyleRuntimeProvider, { runtime }, children),
    );
  }
  function wrapper(Outer: RenderOptions['wrapper']) {
    return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
      return createElement(Host, null, Outer ? createElement(Outer, null, children) : children);
    };
  }
  return {
    runtime,
    Host,
    ...runtime.theme,
    pinDesignWidth: runtime.breakpoints.pinDesignWidth,
    currentBreakpoint: () => readCurrentBreakpoint(runtime.breakpoints),
    breakpointIndex: () => readBreakpoint(runtime.breakpoints),
    render: (ui, options) => renderTree(ui, { ...options, wrapper: wrapper(options?.wrapper) }),
    renderHook: (callback, options) =>
      renderReactHook(callback, { ...options, wrapper: wrapper(options?.wrapper) }),
    styles: (decls) => defineStyles(decls, runtime),
    sv: ((config: Parameters<typeof defineRecipe>[0]) =>
      bindRecipe(defineRecipe(config), runtime)) as typeof defineRecipe,
    color: (value, theme = runtime.theme.activeTheme()) => resolveColor(value, theme),
    normalize: (decl, at = runtime.breakpoints.index(), theme = runtime.theme.activeTheme()) =>
      normalizeDecl(decl, at, theme),
    boxStyle: (decl, at = runtime.breakpoints.index(), theme = runtime.theme.activeTheme()) =>
      resolveBox(decl, at, theme),
    textStyle: (decl, theme = runtime.theme.activeTheme()) => resolveText(decl, theme),
    sharedStyle: (key, decl, scope = runtime) => resolveSharedStyle(key, decl, scope),
    groundShade: (alpha, theme = runtime.theme.activeTheme()) => shade(alpha, theme),
    onPaper: (theme = runtime.theme.activeTheme()) => paper(theme),
    radiusValue: (corner, side, theme = runtime.theme.activeTheme()) => radius(corner, side, theme),
    scaledRadius: (corner, factor, theme = runtime.theme.activeTheme()) =>
      scaled(corner, factor, theme),
    themed: (make, owner = runtime.theme) => memoTheme(make, owner),
    themedCache: (limit, owner = runtime.theme) => memoCache(limit, owner),
    applyMode: (mode) => applyGround(mode, runtime),
    writeMode: (mode) => writeGround(mode, runtime, options.deviceStore),
  };
}
