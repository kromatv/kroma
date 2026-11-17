const HANDHELD = /Mobi|Android|iPhone|iPad|iPod/;
const DESKTOP = /Windows NT|Macintosh|X11|CrOS/;

/** The width a desktop visitor's page is laid out at before the browser measures its own. */
export const DESKTOP_WIDTH = 1280;

/**
 * The design width to render a request at, from its `Sec-CH-UA-Mobile` hint
 * and its user agent: {@link DESKTOP_WIDTH} when they name a desktop, and
 * none, which is the phone layout, for a handheld or a request that says
 * nothing.
 */
export function guessDesignWidth(
  hints: Readonly<{ mobile?: string; agent?: string }>,
): number | undefined {
  const agent = hints.agent ?? '';
  if (hints.mobile === '?1' || HANDHELD.test(agent)) {
    return undefined;
  }
  return hints.mobile === '?0' || DESKTOP.test(agent) ? DESKTOP_WIDTH : undefined;
}
