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
}

export const PREVIEW_THEMES: readonly PreviewTheme[] = [
  { id: 'kroma', label: 'KROMA', theme: KROMA },
  { id: 'ocean', label: 'Ocean', theme: ocean },
  { id: 'ember', label: 'Ember', theme: ember },
  { id: 'terminal', label: 'Terminal', theme: terminal },
];
