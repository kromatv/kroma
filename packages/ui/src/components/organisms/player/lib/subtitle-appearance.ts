import { deviceStorage } from '@kroma/core';
import { useCallback, useEffect, useState } from 'react';
import type { TextStyle } from 'react-native';
import { clampPct, edgeStyle } from './subtitle-edge';

/**
 * Subtitle appearance (§8): size, colour, edge treatment, font and opacity, with
 * a live preview. Shared by web + TV and persisted to localStorage so a viewer's
 * choice follows them across sessions and platforms on the same device.
 */

export type SubSize = 'sm' | 'md' | 'lg' | 'xl';
export type SubEdge = 'shadow' | 'box' | 'outline' | 'none';
export type SubFont = 'sans' | 'serif' | 'mono';

export interface SubtitleAppearance {
  size: SubSize;
  color: string;
  edge: SubEdge;
  font: SubFont;
  /** Text opacity, 20–100 (§8). */
  opacity: number;
  /** Background box opacity 0–100 (only used when edge = 'box'). */
  bgOpacity: number;
}

export const DEFAULT_SUB_APPEARANCE: SubtitleAppearance = {
  size: 'md',
  color: '#FFFFFF',
  edge: 'shadow',
  font: 'sans',
  opacity: 100,
  bgOpacity: 75,
};

/** Swatch palette (§8): white, yellow, blue, amber, pink. */
export const SUB_COLORS = ['#FFFFFF', '#F5E050', '#6FA8FF', '#F4B642', '#F58CC0'];

const SIZE_PX: Record<SubSize, number> = { sm: 26, md: 36, lg: 48, xl: 62 };

const FONT_STACK: Record<SubFont, string> = {
  sans: "'Hanken Grotesk', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'SF Mono', ui-monospace, 'Courier New', monospace",
};

const KEY = 'kroma.subtitleStyle';

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
      if (raw) setStyle({ ...DEFAULT_SUB_APPEARANCE, ...JSON.parse(raw) });
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

/** The text style for a subtitle line, from the viewer's appearance choice.
 * The edge treatment is the one piece that differs per platform (see
 * subtitle-edge.ts); everything else is one set of numbers. */
export function subtitleStyle(style: SubtitleAppearance): TextStyle {
  const size = SIZE_PX[style.size];
  return {
    color: style.color,
    fontSize: size,
    fontWeight: '600',
    // React Native needs an absolute line height, not the design's 1.3 ratio.
    lineHeight: Math.round(size * 1.3),
    fontFamily: FONT_STACK[style.font],
    textAlign: 'center',
    borderRadius: 10,
    opacity: Math.max(0.2, Math.min(1, style.opacity / 100)),
    ...(style.edge === 'box' ? { paddingVertical: 4, paddingHorizontal: 16 } : null),
    ...edgeStyle(style.edge, clampPct(style.bgOpacity)),
  };
}
