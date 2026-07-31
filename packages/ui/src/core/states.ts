// The interaction states a recipe can paint.

/** In cascade order. `active` is deliberately absent: a toggle's pressed-in
 *  reading is owned by the component's props, not the pointer, so it is a
 *  variant - which is also what lets it carry its own `_hover`. */
export const SV_STATES = ['hover', 'focus', 'press', 'disabled'] as const;

export type SvStateName = (typeof SV_STATES)[number];

export type SvState = Partial<Record<SvStateName, boolean>>;

export type StateKey = `_${SvStateName}`;

export const STATE_KEYS: ReadonlySet<string> = new Set(SV_STATES.map((name) => `_${name}`));

export const STATE_BIT: Readonly<Record<SvStateName, number>> = Object.freeze(
  Object.fromEntries(SV_STATES.map((name, i) => [name, 1 << i])) as Record<SvStateName, number>,
);

/** Which states a recipe declares. A caller always passes all four, so without
 *  a mask a recipe with no `_hover` mints separate hovered and unhovered cache
 *  entries holding identical styles. */
export function maskOf(declared: Iterable<SvStateName>): number {
  let mask = 0;
  for (const name of declared) mask |= STATE_BIT[name];
  return mask;
}

// Precomputed for all sixteen combinations: this runs on cache hits too, which
// is the hot path and the one place that must not allocate.
const SUFFIX: readonly string[] = Array.from({ length: 1 << SV_STATES.length }, (_, bits) =>
  SV_STATES.map((name, i) => ((bits & (1 << i)) === 0 ? '-' : name[0])).join(''),
);

const EMPTY_SUFFIX = SUFFIX[0] as string;

/** The state half of a cache key. Only states in `mask` contribute, so two calls
 *  differing solely in a state the recipe ignores share one entry. */
export function stateSuffix(state: SvState | undefined, mask: number): string {
  if (mask === 0 || state === undefined) return EMPTY_SUFFIX;
  let bits = 0;
  for (const name of SV_STATES) {
    if (state[name] === true) bits |= STATE_BIT[name];
  }
  return SUFFIX[bits & mask] as string;
}
