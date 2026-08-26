// What <Select>'s parts share: the Root's state, and the per-row plumbing the
// open surface hands each <Select.Item>.

import type { RefObject } from 'react';
import { createContext, useContext } from 'react';
import type { StyleProp, TextStyle, View } from 'react-native';
import type { IconName } from '#ui/components/atoms/icon';
import { partContext } from '#ui/lib/part-context';

/** Why the surface closed. `back` is the remote's Back button (and, in a
 *  browser TV shell, the key it arrives as). */
type SelectDismissReason = 'select' | 'outside' | 'escape' | 'back';

type SelectOpenReason = 'trigger' | SelectDismissReason;

interface SelectOpenDetails {
  reason: SelectOpenReason;
}

interface SelectOption {
  value: string;
  label: string;
  note?: string;
  icon?: IconName;
  disabled?: boolean;
}

interface SelectValueDetails {
  item: SelectOption;
}

interface SelectState {
  value: string;
  current: SelectOption | undefined;
  label: string | undefined;
  placeholder: string | undefined;
  open: boolean;
  disabled: boolean;
  anchor: RefObject<View | null>;
  setOpen: (open: boolean, reason: SelectOpenReason) => void;
  pick: (value: string) => void;
}

const [SelectContext, useSelect] = partContext<SelectState>('Select.Root');

interface SelectRowState {
  presentation: 'panel' | 'dialog';
  nativeID?: string;
  active: boolean;
  /** Whether the keys put the highlight here rather than a cursor sweeping
   *  past: the ring is the keyboard's, the wash is the pointer's. */
  keyed?: boolean;
  onHoverIn?: () => void;
  onLayout?: (y: number, height: number) => void;
}

const DIALOG_ROW: SelectRowState = { presentation: 'dialog', active: false };

const SelectRowContext = createContext<SelectRowState>(DIALOG_ROW);

function useSelectRow(): SelectRowState {
  return useContext(SelectRowContext);
}

interface SelectItemState {
  value: string;
  chosen: boolean;
}

const [SelectItemContext, useSelectItem] = partContext<SelectItemState>('Select.Item');

// The trigger's resolved text slot, so <Select.Value> wears the shell's metrics
// wherever the caller puts it.
const SelectInkContext = createContext<StyleProp<TextStyle>>(undefined);

export type {
  SelectDismissReason,
  SelectItemState,
  SelectOpenDetails,
  SelectOpenReason,
  SelectOption,
  SelectRowState,
  SelectState,
  SelectValueDetails,
};
export {
  DIALOG_ROW,
  SelectContext,
  SelectInkContext,
  SelectItemContext,
  SelectRowContext,
  useSelect,
  useSelectItem,
  useSelectRow,
};
