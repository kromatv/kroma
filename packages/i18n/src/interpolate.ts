import type { TVars } from './types';

const TOKEN = /\{(\w+)}/g;

/** Substitute `{name}` tokens from `vars`. Unknown tokens are kept verbatim.
 *
 *  One pass, deliberately: a substituted value that itself looks like a token
 *  is never rescanned, so a variable carrying user text cannot reach back into
 *  the catalog. The `kroma-i18n` crate pins the same guarantee. Reuse between
 *  messages is a catalog concern, handled once at build by {@link expandRefs}. */
export function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(TOKEN, (whole, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  );
}
