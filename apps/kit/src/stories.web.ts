// The Vite mirror of `stories.ts`. `import.meta.glob` is a compile-time
// transform resolved relative to the file that writes it, and it is matched
// TEXTUALLY: a constant for the pattern or the options stops being a glob.

import { PROPS } from 'virtual:kroma-props';
import { discoverVite } from '@kroma/workbench';

export const STORIES = discoverVite(
  import.meta.glob('#ui/**/*.{stories,demo}.tsx', { eager: true }),
  import.meta.glob('#ui/**/*.demo.tsx', { eager: true, query: '?raw', import: 'default' }),
  PROPS,
);
