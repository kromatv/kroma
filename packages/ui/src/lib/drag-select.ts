// Suppressing the browser's text selection for the duration of a drag.
//
// A no-op off the web: there is no selection to make on a television.

export function suppressSelection(): () => void {
  return NOOP;
}

const NOOP = () => {};
