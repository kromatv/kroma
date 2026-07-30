// The subtitle edge treatment, native (Apple TV / Android TV): React Native has
// only ONE text shadow, so each CEA-708 stroke treatment gets one approximation
// (see subtitle-edge.web.ts for the exact browser version). The background is a
// separate CEA-708 layer (subtitle-appearance.ts), not an edge.

import type { TextStyle } from 'react-native';
import type { SubEdge } from './subtitle-appearance';

const HARD = '#000000';
// Not 0: Android's Paint drops the shadow layer entirely at radius 0, which
// would render raised/depressed identically to `none`.
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
