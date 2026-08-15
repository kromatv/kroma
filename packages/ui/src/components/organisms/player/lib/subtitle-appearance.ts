import { deviceStorage } from '@kroma/core';
import { useCallback, useEffect, useState } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';
import type { ColorValue } from '#ui/core';
import { edgeStyle } from './subtitle-edge';

/**
 * Subtitle appearance (§8): size, colour, edge, font, opacity, background and
 * window, persisted to localStorage. The option sets are CEA-708 (FCC-required,
 * graded by Samsung's TV certification). Trimming one is a certification defect.
 */

/** Hold a 0-100 percentage inside its range: an rgba() alpha outside 0..1 is an
 * invalid colour, and an invalid colour drops the whole declaration. */
export const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

export type SubSize = 'sm' | 'md' | 'lg' | 'xl';
export type SubEdge = 'none' | 'raised' | 'depressed' | 'uniform' | 'shadow';
export type SubFont =
  | 'default'
  | 'monoSerif'
  | 'propSerif'
  | 'monoSans'
  | 'propSans'
  | 'casual'
  | 'cursive'
  | 'smallCaps';

export interface SubtitleAppearance {
  size: SubSize;
  color: string;
  edge: SubEdge;
  font: SubFont;
  /** 20–100 (§8). */
  opacity: number;
  bgColor: string;
  /** 0–100; 0 = no background. */
  bgOpacity: number;
  windowColor: string;
  /** 0–100; 0 = no window. */
  windowOpacity: number;
}

/** Deliberately not CEA-708's defaults (white on an opaque black box): a film
 * should open with captions that sit on the picture, not a slab across it. */
export const DEFAULT_SUB_APPEARANCE: SubtitleAppearance = {
  size: 'md',
  color: '#FFFFFF',
  edge: 'shadow',
  font: 'default',
  opacity: 100,
  bgColor: '#000000',
  bgOpacity: 0,
  windowColor: '#000000',
  windowOpacity: 0,
};

export const SUB_COLORS = [
  '#FFFFFF',
  '#000000',
  '#FF0000',
  '#00FF00',
  '#0000FF',
  '#FFFF00',
  '#FF00FF',
  '#00FFFF',
] as const satisfies readonly ColorValue[];

/** CEA-708 order, also the order ◀▶ steps through them. The single source of
 * truth: a treatment missing here would compile but be unreachable. */
export const SUB_EDGES: readonly SubEdge[] = ['none', 'raised', 'depressed', 'uniform', 'shadow'];
export const SUB_FONTS: readonly SubFont[] = [
  'default',
  'monoSerif',
  'propSerif',
  'monoSans',
  'propSans',
  'casual',
  'cursive',
  'smallCaps',
];

const SIZE_PX: Record<SubSize, number> = { sm: 26, md: 36, lg: 48, xl: 62 };

/** The app's own UI face. `smallCaps` is a variant of it via `fontVariant`,
 * not a separate family. */
const UI_SANS = "'Hanken Grotesk', system-ui, sans-serif";

/** CEA-708's font styles mapped onto stacks a TV browser actually has, falling
 * back through generics: a television ships few fonts. */
const FONT_STACK: Record<SubFont, string> = {
  default: UI_SANS,
  monoSerif: "'Courier New', Courier, monospace",
  propSerif: "Georgia, 'Times New Roman', Times, serif",
  monoSans: "'SF Mono', ui-monospace, Menlo, Consolas, monospace",
  propSans: "'Hanken Grotesk', Arial, Helvetica, sans-serif",
  casual: "'Comic Sans MS', 'Chalkboard SE', cursive",
  cursive: "'Apple Chancery', 'Brush Script MT', cursive",
  smallCaps: UI_SANS,
};

const KEY = 'kroma.subtitleStyle';

const isEdge = (v: unknown): v is SubEdge => SUB_EDGES.includes(v as SubEdge);
const isFont = (v: unknown): v is SubFont => SUB_FONTS.includes(v as SubFont);

/** Retired option names. `box` was an edge that drew a background, now its
 * own layer, so it leaves behind no edge. */
const LEGACY_EDGE: Record<string, SubEdge> = { box: 'none', outline: 'uniform' };
const LEGACY_FONT: Record<string, SubFont> = {
  sans: 'propSans',
  serif: 'propSerif',
  mono: 'monoSans',
};
/** Retired brand palette, mapped onto its nearest CEA-708 neighbour: an
 * unmapped swatch would fall outside `SUB_COLORS` and become unselectable. */
const LEGACY_COLOR: Record<string, string> = {
  '#F5E050': '#FFFF00',
  '#6FA8FF': '#00FFFF',
  '#F4B642': '#FFFF00',
  '#F58CC0': '#FF00FF',
};

function colour(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const mapped = LEGACY_COLOR[v] ?? v;
  return (SUB_COLORS as readonly string[]).includes(mapped) ? mapped : fallback;
}

/** Bring a stored choice onto the current model, mapping retired option names
 * (`outline` → `uniform`, `box` → `none` edge + background) so a viewer's old
 * choice isn't silently lost. */
export function migrateAppearance(raw: unknown): SubtitleAppearance {
  const v = (raw ?? {}) as Record<string, unknown>;
  const boxed = v.edge === 'box';
  const edge = typeof v.edge === 'string' ? (LEGACY_EDGE[v.edge] ?? v.edge) : undefined;
  const font = typeof v.font === 'string' ? (LEGACY_FONT[v.font] ?? v.font) : undefined;

  // `bgColor` marks the new model; on an old value `bgOpacity` is only real
  // when the edge was the box that used it. Reading it unconditionally would
  // hand a background to someone who chose a plain drop shadow.
  const stored = typeof v.bgOpacity === 'number' ? v.bgOpacity : undefined;
  const onNewModel = typeof v.bgColor === 'string';
  let bgOpacity = DEFAULT_SUB_APPEARANCE.bgOpacity;
  if (boxed) bgOpacity = clampPct(stored ?? 75);
  else if (onNewModel && stored !== undefined) bgOpacity = clampPct(stored);

  return {
    ...DEFAULT_SUB_APPEARANCE,
    ...v,
    edge: isEdge(edge) ? edge : DEFAULT_SUB_APPEARANCE.edge,
    font: isFont(font) ? font : DEFAULT_SUB_APPEARANCE.font,
    // Every colour goes through the same gate: anything the panel cannot select
    // is a value the viewer could not get back to.
    color: colour(v.color, DEFAULT_SUB_APPEARANCE.color),
    bgColor: colour(v.bgColor, DEFAULT_SUB_APPEARANCE.bgColor),
    windowColor: colour(v.windowColor, DEFAULT_SUB_APPEARANCE.windowColor),
    bgOpacity,
  };
}

function readStoredAppearance(): SubtitleAppearance | null {
  try {
    const raw = deviceStorage()?.getItem(KEY);
    return raw ? migrateAppearance(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function persistAppearance(next: SubtitleAppearance): void {
  try {
    deviceStorage()?.setItem(KEY, JSON.stringify(next));
  } catch {}
}

/** Persisted subtitle appearance. SSR-safe: starts from defaults (matching the
 * server render), then hydrates from localStorage on the client. */
export function useSubtitleAppearance(): [
  SubtitleAppearance,
  (next: Partial<SubtitleAppearance>) => void,
] {
  const [style, setStyle] = useState<SubtitleAppearance>(DEFAULT_SUB_APPEARANCE);

  useEffect(() => {
    const stored = readStoredAppearance();
    if (stored) setStyle(stored);
  }, []);

  const update = useCallback((next: Partial<SubtitleAppearance>) => {
    setStyle((prev) => {
      const merged = { ...prev, ...next };
      persistAppearance(merged);
      return merged;
    });
  }, []);

  return [style, update];
}

/** `#RRGGBB` + a 0–100 opacity as an rgba() the RN and DOM sides both take. */
export function withOpacity(hex: string, pct: number): string {
  const h = hex.replace('#', '');
  const n = Number.parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return `rgba(${r}, ${g}, ${b}, ${clampPct(pct) / 100})`;
}

/** The caption window's style: the band the cue block sits in. A ViewStyle,
 * not a TextStyle: RN's stricter native typings require it for a container. */
export function subtitleWindowStyle(style: SubtitleAppearance): ViewStyle {
  if (style.windowOpacity <= 0) return NO_WINDOW;
  return {
    backgroundColor: withOpacity(style.windowColor, style.windowOpacity),
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 10,
  };
}

// Interned: the default appearance has no window, and the cue re-renders at
// playback cadence. A fresh `{}` each time defeats Box's own style caching.
const NO_WINDOW: ViewStyle = Object.freeze({});

/** The text style for a subtitle line, from the viewer's appearance choice.
 * The edge treatment is the one piece that differs per platform (see
 * subtitle-edge.ts); everything else is one set of numbers. */
export function subtitleStyle(style: SubtitleAppearance): TextStyle {
  const size = SIZE_PX[style.size];
  const hasBg = clampPct(style.bgOpacity) > 0;
  return {
    // Folded into the colour, not node opacity: the node also carries the
    // background box, so `opacity` would dim it too, and the window (a
    // separate View) wouldn't dim at all. CEA-708 gives each layer its own opacity.
    color: withOpacity(style.color, Math.max(20, style.opacity)),
    fontSize: size,
    fontWeight: '600',
    // React Native needs an absolute line height, not the design's 1.3 ratio.
    lineHeight: Math.round(size * 1.3),
    fontFamily: FONT_STACK[style.font],
    ...(style.font === 'smallCaps' ? ({ fontVariant: ['small-caps'] } as TextStyle) : null),
    textAlign: 'center',
    borderRadius: 10,
    ...(hasBg
      ? {
          backgroundColor: withOpacity(style.bgColor, style.bgOpacity),
          paddingVertical: 4,
          paddingHorizontal: 16,
        }
      : null),
    ...edgeStyle(style.edge),
  };
}
