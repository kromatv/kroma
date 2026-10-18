import { createContext, useContext } from 'react';

/** The attributes a styling root stamps on its element in a browser: whose
 *  theme, which ground, which breakpoint steps. Tokens and compiled styles
 *  read them through the cascade, so whatever renders outside the root's
 *  element carries them along to paint the same. */
export interface ScopeMarks {
  readonly 'data-kroma-theme'?: string;
  readonly 'data-theme'?: 'light' | 'dark';
  readonly 'data-kroma-bp': string;
}

export const ScopeMarksContext = createContext<ScopeMarks | null>(null);

/** The marks of the nearest styling root, or null outside every root. */
export function useScopeMarks(): ScopeMarks | null {
  return useContext(ScopeMarksContext);
}
