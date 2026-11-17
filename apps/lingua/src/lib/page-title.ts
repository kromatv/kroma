const SITE = 'Lingua';

/** A page's `<title>`: what it shows, the closest thing first, then the site: `about · French · owner/repo · Lingua`. */
export function pageTitle(...parts: readonly string[]): string {
  return [...parts.filter((part) => part.trim() !== ''), SITE].join(' · ');
}

/** A route's `head` naming the page in the browser's tab, its history and a bookmark. */
export function titled(...parts: readonly string[]): { meta: [{ title: string }] } {
  return { meta: [{ title: pageTitle(...parts) }] };
}
