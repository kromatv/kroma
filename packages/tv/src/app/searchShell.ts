// Search chrome: the field and the keyboard, when the platform's own beat ours.
//
// Every television here types with a D-pad on an on-screen keyboard we draw
// (see `shared/ui/keyboard`), and that is the right call nearly everywhere: it
// is the only way to keep one layout, one look and the AZERTY/QWERTY device
// preference across four shells.
//
// Apple TV is the exception, and dictation is the whole reason. The Siri
// Remote's microphone is never lent to an app, but the SYSTEM keyboard hears it:
// holding the Siri button while a `UISearchController` is on screen dictates
// into its field. That is why every tvOS media app uses the platform search
// chrome. Drawing our own keyboard there does not just look slightly different,
// it costs the user the only voice input the device has.
//
// So the shell may register a replacement for the left-hand column. It owns the
// field and the keys; the results grid, the posters and their focus stay ours,
// rendered as its children in whatever room it says it has left. A shell that
// registers nothing keeps the on-screen keyboard, which is still what Tizen,
// webOS, Android TV and the desktop build get.
//
// Registration is dependency injection, exactly like the voice backend: the
// bundler never has to reason about a native module a target does not install.

import type { ComponentType, ReactNode } from 'react';

export interface SearchShellProps {
  /** The query, as the search screen knows it. */
  value: string;
  /** Typed, dictated or cleared: the screen re-runs the search on every call. */
  onChange: (text: string) => void;
  /** Label for the platform's field. */
  placeholder: string;
  /** The results, given the room the platform left for them. It is a function
   * because only the shell knows that size (the keyboard's width is the
   * platform's business), and the grid needs it to pick its columns. */
  children: (area: { width: number; height: number }) => ReactNode;
}

export interface SearchShell {
  /** Cheap, synchronous probe, read on every render of the search screen. False
   * falls back to the on-screen keyboard. */
  available: () => boolean;
  /** The whole search screen: field, keyboard, and our results inside it. */
  Shell: ComponentType<SearchShellProps>;
}

let current: SearchShell | null = null;

/** Register the shell's search chrome. Call once at the app root, before the
 * first render. Passing null removes it (what a test does to get back to the
 * on-screen keyboard). */
export function setSearchShell(shell: SearchShell | null): void {
  current = shell;
}

/** The registered chrome, or null when there is none or it reports itself
 * unavailable right now. A throwing probe counts as unavailable: a broken
 * capability check must not take the search screen down with it. */
export function searchShell(): SearchShell | null {
  if (!current) return null;
  try {
    return current.available() ? current : null;
  } catch {
    return null;
  }
}
