// The subtitle edge treatment, native (Apple TV / Android TV).
//
// React Native supports ONE text shadow (offset + radius + colour), so the
// design's four-way outline is approximated by a tight dark halo. The other
// three treatments map exactly. See subtitle-edge.web.ts for the browser half,
// which can spell the outline out as four shadows.

import type { TextStyle } from 'react-native';
import type { SubEdge } from './subtitle-appearance';

export function edgeStyle(edge: SubEdge, bgOpacity: number): TextStyle {
  if (edge === 'shadow') {
    return {
      textShadowColor: 'rgba(0, 0, 0, 0.92)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 10,
    };
  }
  if (edge === 'outline') {
    return {
      textShadowColor: '#000000',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 3,
    };
  }
  if (edge === 'box') {
    return { backgroundColor: `rgba(0, 0, 0, ${clampPct(bgOpacity) / 100})` };
  }
  return {};
}

export const clampPct = (n: number): number => Math.max(0, Math.min(100, n));
