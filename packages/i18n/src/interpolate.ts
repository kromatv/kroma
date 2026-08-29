import type { TVars } from './types';

const TOKEN = /\{(\w+)}/g;
const ANY_TOKEN = /\{\w+}/;

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

/** Whether `text` still names a `{token}`. After {@link interpolate} that means
 *  a variable the caller never passed, since an unknown token is kept
 *  verbatim. */
export function hasToken(text: string): boolean {
  return ANY_TOKEN.test(text);
}

/** The `{token}` names `text` still carries. */
export function tokensIn(text: string): string[] {
  return [...text.matchAll(TOKEN)].map(([, name]) => name as string);
}
