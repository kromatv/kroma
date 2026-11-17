const HERE = 'https://lingua.invalid';

/**
 * The page on this site a trip through GitHub comes back to, or `/` for an
 * address that would leave it. `to` is read the way a browser reads a
 * `Location`, so `//host`, `/\host` and a tab or newline hiding either are
 * all refused.
 */
export function returnPath(to: string | undefined): string {
  if (!to?.startsWith('/')) {
    return '/';
  }
  const url = URL.parse(to, HERE);
  return url?.origin === HERE ? `${url.pathname}${url.search}${url.hash}` : '/';
}
