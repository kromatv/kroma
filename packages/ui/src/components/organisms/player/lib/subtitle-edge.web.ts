// The CEA-708 subtitle edge treatments, web: drawn as the standard describes,
// via comma-separated text shadows. The background is a separate CEA-708 layer
// (subtitle-appearance.ts), not an edge treatment.

import type { TextStyle } from 'react-native';
import type { SubEdge } from './subtitle-appearance';

export function edgeStyle(edge: SubEdge): TextStyle {
  if (edge === 'shadow') {
    return { textShadow: '0 2px 10px rgba(0,0,0,.92), 0 0 3px rgba(0,0,0,.95)' } as TextStyle;
  }
  if (edge === 'uniform') {
    return {
      textShadow:
        '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 2px 6px rgba(0,0,0,.7)',
    } as TextStyle;
  }
  if (edge === 'raised') {
    return { textShadow: '1px 1px 0 #000, 2px 2px 0 rgba(0,0,0,.65)' } as TextStyle;
  }
  if (edge === 'depressed') {
    return { textShadow: '-1px -1px 0 #000, -2px -2px 0 rgba(0,0,0,.65)' } as TextStyle;
  }
  return {};
}
