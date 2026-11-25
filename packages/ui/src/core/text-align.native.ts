const PHYSICAL: Readonly<Record<string, string>> = { start: 'left', end: 'right' };

/** The `textAlign` React Native is handed. It knows no `start` or `end`, and
 *  swaps `left` and `right` itself when the layout runs right to left. */
export function textAlignOf(align: unknown): unknown {
  return (typeof align === 'string' && PHYSICAL[align]) || align;
}
