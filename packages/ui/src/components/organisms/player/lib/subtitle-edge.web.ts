// The subtitle edge treatment, web. The browser takes a comma-separated list of
// text shadows, so each CEA-708 treatment is drawn as the standard describes it:
// `uniform` as a four-way stroke, `raised` and `depressed` as a hard offset in
// opposite directions (which is the whole difference between them), and `shadow`
// as a soft drop shadow.
//
// The background is NOT an edge treatment - it is its own CEA-708 layer, with
// its own colour and opacity, and lives in subtitle-appearance.ts.

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
