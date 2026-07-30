// A declarative redirect system for the memory router: navigation policy is a
// flat, ordered list of rules ("when <state>, only <allow> may stay; anything
// else redirects to <to>"). First matching rule wins.

// `R` is every screen name; `T` is the narrower subset a rule may redirect to,
// so callers can restrict redirect targets while any screen may still "stay".
export interface RedirectRule<S, R extends string, T extends R = R> {
  when: (state: S) => boolean;
  to: T;
  allow: readonly R[];
}

/** Returns the redirect target, or `null` when the current screen is already
 * allowed (or no rule applies). */
export function resolveRedirect<S, R extends string, T extends R>(
  rules: readonly RedirectRule<S, R, T>[],
  state: S,
  current: R,
): T | null {
  for (const rule of rules) {
    if (rule.when(state)) return rule.allow.includes(current) ? null : rule.to;
  }
  return null;
}
