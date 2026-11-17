import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import { guessDesignWidth } from './guess-design-width';

/** The width a server lays the page out at, guessed from the request so a
 *  desktop's first paint is already its layout. The browser measures its own
 *  and pins none. */
export const visitorWidth = createIsomorphicFn()
  .server(() =>
    guessDesignWidth({
      mobile: getRequestHeader('sec-ch-ua-mobile'),
      agent: getRequestHeader('user-agent'),
    }),
  )
  .client((): number | undefined => undefined);
