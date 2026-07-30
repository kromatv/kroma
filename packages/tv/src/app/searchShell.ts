// Search chrome: the field and the keyboard, when the platform's own beat ours.
//
// Every television here draws its own on-screen keyboard (see `shared/ui/keyboard`)
// except Apple TV: the Siri Remote's microphone only dictates into a system
// `UISearchController`, never into an app's own field, so tvOS media apps use
// the platform search chrome instead.
//
// A shell may register a replacement for the left-hand column (field + keys);
// the results grid stays ours, rendered as its children in whatever room it
// says it has left. Registering nothing keeps the on-screen keyboard.

import type { ComponentType, ReactNode } from 'react';

export interface SearchShellProps {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  children: (area: { width: number; height: number }) => ReactNode;
}

export interface SearchShell {
  available: () => boolean;
  Shell: ComponentType<SearchShellProps>;
}

let current: SearchShell | null = null;

/** Call once at the app root, before the first render; null removes it. */
export function setSearchShell(shell: SearchShell | null): void {
  current = shell;
}

/** Null when unregistered or its probe reports unavailable; a throwing probe
 * also counts as unavailable rather than taking the search screen down. */
export function searchShell(): SearchShell | null {
  if (!current) return null;
  try {
    return current.available() ? current : null;
  } catch {
    return null;
  }
}
