import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import { guessDesignWidth } from './guess-design-width';

const STAMP = 'data-design-width';

/** The width the page is first laid out at. A server guesses it from the
 *  request, so a desktop's first paint is already its layout. A browser reads
 *  the guess off the document the server stamped with {@link widthStamp}, so
 *  hydration lays out the tree the HTML holds before it measures its own. */
export const visitorWidth = createIsomorphicFn()
  .server(() =>
    guessDesignWidth({
      mobile: getRequestHeader('sec-ch-ua-mobile'),
      agent: getRequestHeader('user-agent'),
    }),
  )
  .client((): number | undefined => {
    const stamped = Number(document.documentElement.getAttribute(STAMP));
    return stamped > 0 ? stamped : undefined;
  });

/** The `<html>` attribute that carries the server's design width to the browser. */
export function widthStamp(width: number | undefined): { [STAMP]?: number } {
  return width === undefined ? {} : { [STAMP]: width };
}
