// Which ring a control inside a clipping surface draws.
//
// A focus ring stands OFF its control, so a surface that clips its contents cuts
// the ring of anything flush with an edge down to a stripe. A row of a
// <ListRow.Group> knows this about itself and says so in its own recipe, but the
// controls a caller puts BESIDE that row - a read/unread toggle, a trash button -
// cannot know what card they woke up in. This is how the surface tells them.
//
// Its own module, with no imports from the focus family, so the surface and the
// control can both reach it without importing each other (as focus-presence.ts
// does for the navigator).

import { createContext, useContext } from 'react';
import type { RingToken } from '#ui/core/theme';

const RingScope = createContext<RingToken | undefined>(undefined);

/** Provided by a surface that clips what it holds; never used directly. */
const RingScopeProvider = RingScope.Provider;

/** The ring every control in this subtree draws, unless it asks for another. */
function useRingScope(): RingToken | undefined {
  return useContext(RingScope);
}

export { RingScopeProvider, useRingScope };
