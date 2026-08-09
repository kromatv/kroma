// The contract between <Select>'s trigger and whichever options surface the
// platform mounts (see ./select-options and ./select-options.web).

import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { SelectOption } from './select';

export interface SelectSurfaceProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the list. */
  label: string;
  options: readonly SelectOption[];
  value: string;
  onPick: (next: string) => void;
  /** The trigger, for the popover presentation to anchor and re-focus. */
  anchor: RefObject<View | null>;
}
