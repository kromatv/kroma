// The preview themes the toolbar can switch between, one file per theme: the
// real KROMA, two accent restatements, and one full restatement. They exist to
// prove a theme reaches everything: if a control stays amber under Ocean, or
// keeps its round corners under Terminal, its declaration is bypassing the
// vocabulary.

import { KROMA, type Theme } from '@kroma/ui/kit';
import { ember } from './ember';
import { ocean } from './ocean';
import { terminal } from './terminal';

interface PreviewTheme {
  id: string;
  label: string;
  theme: Theme;
  /** The same theme on paper, for one that restates the ground itself. A theme
   *  that only restates an accent needs none: an accent is an accent in both. */
  light?: Theme;
}

export const PREVIEW_THEMES: readonly PreviewTheme[] = [
  { id: 'kroma', label: 'KROMA', theme: KROMA },
  { id: 'ocean', label: 'Ocean', theme: ocean },
  { id: 'ember', label: 'Ember', theme: ember },
  // No paper half on purpose: phosphor on glass IS the theme, so it paints the
  // same in either ground rather than following the page into a light it has no
  // reading of.
  { id: 'terminal', label: 'Terminal', theme: terminal },
];
