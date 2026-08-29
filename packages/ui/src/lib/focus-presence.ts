// Is there a navigator above us at all?
//
// A `<Focusable>` is a node of the spatial navigator, and a navigator item
// THROWS with no `<NavigatorRoot>` above it - which is correct on a television,
// where a control that quietly failed to register is one the remote can never
// reach, and wrong everywhere else: a phone app that renders a kit control has
// no navigator on purpose, because a thumb does not navigate spatially. This
// context is how a control knows which world it woke up in: `<FocusScope>`
// provides it, and an unscoped `<Focusable>` renders its plain pressable form
// instead of registering with an engine that is not there.
//
// Its own module (three exports, no imports from the focus family) so that the
// scope and the control can both reach it without importing each other.

import { createContext, useContext } from 'react';

const InsideFocusScope = createContext(false);

/** Wrap a screen's children in this via <FocusScope>; never directly. */
const FocusPresenceProvider = InsideFocusScope.Provider;

/** True when a <FocusScope> (and so a navigator root) is above this component. */
function useInsideFocusScope(): boolean {
  return useContext(InsideFocusScope);
}

export { FocusPresenceProvider, useInsideFocusScope };
