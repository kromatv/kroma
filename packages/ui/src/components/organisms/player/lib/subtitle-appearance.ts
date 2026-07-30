import { deviceStorage } from '@kroma/core';
import { useCallback, useEffect, useState } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';
import { edgeStyle } from './subtitle-edge';

/**
 * Subtitle appearance (§8): size, colour, edge treatment, font, opacity, and the
 * background and window behind the text. Shared by web + TV and persisted to
 * localStorage so a viewer's choice follows them across sessions and platforms
 * on the same device.
 *
 * The option SETS are not a design choice - they are CEA-708, which is what the
 * FCC requires a caption renderer to offer and what Samsung's TV certification
 * grades an "App UI" caption declaration against: eight colours (for text,
 * background and window alike), eight font styles, five edge treatments, and an
 * opacity for each of the three layers. KROMA renders its own cues rather than
 * handing them to the platform, so this file is where that obligation lives.
 * Trimming a set here is not a tidy-up; it is a certification defect.
 */

/** Hold a 0-100 percentage inside its range: an rgba() alpha outside 0..1 is an
 * invalid colour, and an invalid colour drops the whole declaration. */
export const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

export type SubSize = 'sm' | 'md' | 'lg' | 'xl';
/** CEA-708 edge treatments. */
export type SubEdge = 'none' | 'raised' | 'depressed' | 'uniform' | 'shadow';
/** CEA-708 font styles. */
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
  /** Text colour. */
  color: string;
  edge: SubEdge;
  font: SubFont;
  /** Text opacity, 20–100 (§8). */
  opacity: number;
  /** Colour of the box behind the text. */
  bgColor: string;
  /** Opacity of the box behind the text, 0–100. 0 = no background. */
  bgOpacity: number;
  /** Colour of the caption window (the band the text block sits in). */
  windowColor: string;
  /** Opacity of the caption window, 0–100. 0 = no window. */
  windowOpacity: number;
}

/**
 * The app's defaults, which are deliberately NOT CEA-708's (white on an opaque
 * black box). A film should open with captions that sit on the picture rather
 * than a slab across it; everything CEA-708 asks for is one row away in the
 * panel for anyone who needs it.
 */
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

/** The eight CEA-708 colours, used for text, background and window alike. */
export const SUB_COLORS = [
  '#FFFFFF', // white
  '#000000', // black
  '#FF0000', // red
  '#00FF00', // green
  '#0000FF', // blue
  '#FFFF00', // yellow
  '#FF00FF', // magenta
  '#00FFFF', // cyan
];

/** The edges and fonts in CEA-708's order, which is also the order ◀▶ steps
 * through them. Exported so the panel and the guards below read from ONE list:
 * a treatment missing from a hand-copied array compiles fine and is simply
 * unreachable, which the panel's test calls a certification defect. */
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

/** The app's own UI face. `default` and `smallCaps` are both it - small capitals
 * is a VARIANT of this family, applied through `fontVariant`, not a family. */
const UI_SANS = "'Hanken Grotesk', system-ui, sans-serif";

/**
 * CEA-708's eight font styles, mapped onto stacks a TV browser actually has.
 * `default` follows the app's own UI face; the rest name the family CEA-708
 * describes and fall back through generics, because a television ships very few
 * fonts and the wrong-but-present choice reads better than a silent substitute.
 */
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

/** The two option names CEA-708 retired. `box` was an EDGE that drew a
 * background, which is its own layer now, so what it leaves behind is no edge. */
const LEGACY_EDGE: Record<string, SubEdge> = { box: 'none', outline: 'uniform' };
const LEGACY_FONT: Record<string, SubFont> = {
  sans: 'propSans',
  serif: 'propSerif',
  mono: 'monoSans',
};
/** The retired brand palette, onto its nearest CEA-708 neighbour. Without this a
 * stored swatch survives OUTSIDE `SUB_COLORS`, so the row highlights nothing and
 * `step()`'s `indexOf` returns -1 - one ▶ press then lands on index 1, black text
 * over the picture, with no way back to the colour that was chosen. */
const LEGACY_COLOR: Record<string, string> = {
  '#F5E050': '#FFFF00', // brand yellow -> yellow
  '#6FA8FF': '#00FFFF', // brand blue   -> cyan
  '#F4B642': '#FFFF00', // brand amber  -> yellow
  '#F58CC0': '#FF00FF', // brand pink   -> magenta
};

/** A stored colour, only if it is one this build can actually select. */
function colour(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const mapped = LEGACY_COLOR[v] ?? v;
  return SUB_COLORS.includes(mapped) ? mapped : fallback;
}

/**
 * Bring a stored choice onto the current model.
 *
 * The sets grew when the renderer took on CEA-708, and two of the old names no
 * longer exist: `outline` is what `uniform` is called now, and `box` was an EDGE
 * that drew a background - which is its own layer here. A viewer who chose the
 * box keeps their background rather than silently losing it.
 */
export function migrateAppearance(raw: unknown): SubtitleAppearance {
  const v = (raw ?? {}) as Record<string, unknown>;
  const boxed = v.edge === 'box';
  const edge = typeof v.edge === 'string' ? (LEGACY_EDGE[v.edge] ?? v.edge) : undefined;
  const font = typeof v.font === 'string' ? (LEGACY_FONT[v.font] ?? v.font) : undefined;

  // The background's opacity comes from whichever shape the value is in, and
  // `bgColor` is what tells them apart: only the new model names one, so on an
  // OLD value a stored `bgOpacity` was vestigial unless the edge was the box that
  // used it. Reading it regardless would hand a background to someone who chose
  // a plain drop shadow.
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

/** Persisted subtitle appearance. SSR-safe: starts from defaults (matching the
 * server render), then hydrates from localStorage on the client. */
export function useSubtitleAppearance(): [
  SubtitleAppearance,
  (next: Partial<SubtitleAppearance>) => void,
] {
  const [style, setStyle] = useState<SubtitleAppearance>(DEFAULT_SUB_APPEARANCE);

  useEffect(() => {
    try {
      const raw = deviceStorage()?.getItem(KEY) ?? null;
      if (raw) setStyle(migrateAppearance(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, []);

  const update = useCallback((next: Partial<SubtitleAppearance>) => {
    setStyle((prev) => {
      const merged = { ...prev, ...next };
      try {
        deviceStorage()?.setItem(KEY, JSON.stringify(merged));
      } catch {
        /* ignore */
      }
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

/** The style for the caption WINDOW - the band the whole cue block sits in. A
 * ViewStyle, not a TextStyle: the window is a container around the cue, which is
 * what React Native's stricter native typings hold us to. */
export function subtitleWindowStyle(style: SubtitleAppearance): ViewStyle {
  if (style.windowOpacity <= 0) return NO_WINDOW;
  return {
    backgroundColor: withOpacity(style.windowColor, style.windowOpacity),
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 10,
  };
}

/** Interned, because the default appearance has no window and the cue re-renders
 * at playback cadence - a fresh `{}` each time is exactly what Box's own style
 * caching exists to avoid. */
const NO_WINDOW: ViewStyle = Object.freeze({});

/** The text style for a subtitle line, from the viewer's appearance choice.
 * The edge treatment is the one piece that differs per platform (see
 * subtitle-edge.ts); everything else is one set of numbers. */
export function subtitleStyle(style: SubtitleAppearance): TextStyle {
  const size = SIZE_PX[style.size];
  const hasBg = clampPct(style.bgOpacity) > 0;
  return {
    // Folded into the colour, not set as node opacity: the node also carries the
    // background box, so `opacity` would dim a background the viewer set to 100%
    // - and the window, being a separate View, would not dim at all. CEA-708
    // gives each of the three layers its own opacity. (The phone already did it
    // this way; this is the two agreeing again.)
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
