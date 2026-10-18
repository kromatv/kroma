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

import { type ComponentType, createContext, type ReactNode, useContext } from 'react';

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

const Context = createContext<SearchShell | null>(null);
export const SearchShellProvider = Context.Provider;

/** Read the capability injected by this app root. */
export function useSearchShell(): SearchShell | null {
  return searchShell(useContext(Context));
}

/** Null when unregistered or its probe reports unavailable; a throwing probe
 * also counts as unavailable rather than taking the search screen down. */
export function searchShell(current: SearchShell | null = null): SearchShell | null {
  if (!current) return null;
  try {
    return current.available() ? current : null;
  } catch {
    return null;
  }
}
