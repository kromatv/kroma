// The subtitle edge treatment, web. The browser takes a comma-separated list of
// text shadows, so the design's four-way outline is drawn exactly.

import type { TextStyle } from 'react-native';
import type { SubEdge } from './subtitle-appearance';

export function edgeStyle(edge: SubEdge, bgOpacity: number): TextStyle {
  if (edge === 'shadow') {
    return { textShadow: '0 2px 10px rgba(0,0,0,.92), 0 0 3px rgba(0,0,0,.95)' } as TextStyle;
  }
  if (edge === 'outline') {
    return {
      textShadow:
        '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 2px 6px rgba(0,0,0,.7)',
    } as TextStyle;
  }
  if (edge === 'box') {
    return { backgroundColor: `rgba(0, 0, 0, ${clampPct(bgOpacity) / 100})` };
  }
  return {};
}

export const clampPct = (n: number): number => Math.max(0, Math.min(100, n));
