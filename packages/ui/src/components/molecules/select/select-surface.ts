// The contract between <Select>'s trigger and whichever options surface the
// platform mounts (see ./select-options and ./select-options.web).

import type { ReactElement, RefObject } from 'react';
import type { View } from 'react-native';
import type { SelectDismissReason, SelectOption } from './select-context';

export interface SelectSurfaceProps {
  open: boolean;
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
