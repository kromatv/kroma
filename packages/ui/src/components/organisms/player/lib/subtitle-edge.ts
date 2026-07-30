// The subtitle edge treatment, native (Apple TV / Android TV).
//
// React Native supports ONE text shadow (offset + radius + colour), so the
// treatments CEA-708 describes as stacked strokes get one each: `uniform`
// becomes a tight dark halo, and `raised` / `depressed` a hard offset with no
// blur, which is what gives them their direction. See subtitle-edge.web.ts for
// the browser half, which can spell each one out.
//
// The background is NOT an edge treatment - it is its own CEA-708 layer, with
// its own colour and opacity, and lives in subtitle-appearance.ts.

import type { TextStyle } from 'react-native';
import type { SubEdge } from './subtitle-appearance';

const HARD = '#000000';
/** Not 0: Android's Paint documents "if radius is 0, then the shadow layer is
 * removed", so a hard-offset treatment would render identically to `none` -
 * losing two of CEA-708's five edges on the platform whose captioning rules this
 * file exists for. The smallest non-zero radius keeps the layer and still reads
 * as a hard edge. */
const HARD_EDGE = 0.01;

export function edgeStyle(edge: SubEdge): TextStyle {
  if (edge === 'shadow') {
    return {
      textShadowColor: 'rgba(0, 0, 0, 0.92)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 10,
    };
  }
  if (edge === 'uniform') {
    return {
      textShadowColor: HARD,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 3,
    };
  }
  if (edge === 'raised') {
    return {
      textShadowColor: HARD,
      textShadowOffset: { width: 2, height: 2 },
      textShadowRadius: HARD_EDGE,
    };
  }
  if (edge === 'depressed') {
    return {
      textShadowColor: HARD,
      textShadowOffset: { width: -2, height: -2 },
      textShadowRadius: HARD_EDGE,
    };
  }
  return {};
}
