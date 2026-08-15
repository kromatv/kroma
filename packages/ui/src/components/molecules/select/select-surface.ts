// The contract between <Select>'s trigger and whichever options surface the
// platform mounts (see ./select-options and ./select-options.web).

import type { ReactElement, RefObject } from 'react';
import type { View } from 'react-native';
import type { SelectDismissReason, SelectOption } from './select-context';

/**
 * Where the options appear.
 *
 * `auto` asks the platform, which is what a product wants: a dialog under a
 * D-pad, an anchored popover under a pointer. The other two say it outright,
 * for a caller that knows better than the platform does - a documentation page
 * showing both, or a screen whose layout the popover cannot survive.
 *
 * `panel` is a POINTER presentation and has no native implementation: asked for
 * it, a native target still draws the dialog rather than nothing.
 */
export type SelectPresentation = 'auto' | 'panel' | 'dialog';

export interface SelectSurfaceProps {
  open: boolean;
  presentation: SelectPresentation;
  /** Accessible name of the list. */
  label: string | undefined;
  /** What each item declares, in the order the items were written: the list
   *  keyboard reads it, and the rows are rendered from `items`. */
  options: readonly SelectOption[];
  items: readonly ReactElement[];
  value: string;
  onPick: (next: string) => void;
  onDismiss: (reason: SelectDismissReason) => void;
  /** The trigger, for the popover presentation to anchor and re-focus. */
  anchor: RefObject<View | null>;
}
