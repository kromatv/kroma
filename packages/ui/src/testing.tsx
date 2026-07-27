// Test helpers for anything that renders kit components.
//
// A <Focusable> is a node of the spatial navigator, and a node needs a navigator
// - the router gives every screen one through <FocusScope>. A test that renders
// a control on its own has no router, so it mounts the same scope here.
//
// It provides translations for the same reason. `useT()` THROWS outside an
// <I18nProvider>, which is not a bug: a component that renders a string with no
// locale to render it in is a real mistake in an app. But it means the player
// chrome, the hints and the dialogs cannot be rendered by a test - or by the
// workbench's story smoke test - without one. So this helper gives a tree
// everything a real screen would: a navigator and a language.
//
// Kept out of the kit's public surface: this is for tests, not for screens.

import type { ReactElement } from 'react';
import { FocusScope } from './lib/focus-scope';
import { I18nProvider } from './services/i18n';

/** Whether this screen already has a focus owner, and how a test says one has
 * arrived. An app can only assert "the new screen gets to choose again" through
 * these: `autoFocus` is honoured or ignored on the strength of that one flag
 * (see lib/focus-entry), and no rendered output shows it. */
export { focusSettled, markFocusSettled } from './lib/focus-entry';

/** Wrap a tree in the same navigator and locale a real screen runs inside.
 * English, because an assertion reads better against the words in the test. */
export function onScreen(ui: ReactElement): ReactElement {
  return (
    <I18nProvider locale="en">
      <FocusScope>{ui}</FocusScope>
    </I18nProvider>
  );
}
