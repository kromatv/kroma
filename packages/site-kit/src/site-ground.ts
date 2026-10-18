import { readMode, type ThemeMode } from '@kromatv/ui/kit';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';

/** The ground the visitor chose, read where the page renders: from the request
 *  on the server, from the document in the browser. Both read the one cookie
 *  the theme switch writes, so a server render and its hydration agree. */
export const visitorGround = createIsomorphicFn()
  .server((): ThemeMode => readMode(getRequestHeader('cookie') ?? ''))
  .client((): ThemeMode => readMode());
