// What <Select>'s parts share: the Root's state, and the per-row plumbing the
// open surface hands each <Select.Item>.

import type { ReactNode, RefObject } from 'react';
import { createContext, useContext } from 'react';
import type { StyleProp, TextStyle, View } from 'react-native';
import type { ChangeDetails, ControlOf, ReasonOf } from '#ui/lib/control';
import { partContext } from '#ui/lib/part-context';
import type { selectControl } from './select-control';

/** Why the surface opened or closed, or the value moved. `select` is a pick,
 *  and `set` a setter called without a reason, which is what a developer
 *  tool's call carries. */
type SelectOpenReason = ReasonOf<typeof selectControl>;

/** Why the surface closed. `back` is the remote's Back button (and, in a
 *  browser TV shell, the key it arrives as). */
type SelectDismissReason = Exclude<SelectOpenReason, 'trigger' | 'set'>;

type SelectOpenDetails = ChangeDetails<SelectOpenReason>;

interface SelectOption {
  value: string;
  label: string;
  note?: string;
  disabled?: boolean;
}

/** A change of the value, with the option it picked or unpicked. */
type SelectValueDetails = SelectOpenDetails & { readonly item: SelectOption };

type SelectControl = ControlOf<typeof selectControl>;

interface SelectState extends Pick<SelectControl, 'open' | 'setOpen' | 'trigger'> {
  values: readonly string[];
  multiple: boolean;
  picked: readonly SelectOption[];
  media: ReadonlyMap<string, ReactNode>;
  label: string | undefined;
  placeholder: string | undefined;
  disabled: boolean;
  anchor: RefObject<View | null>;
  pick: SelectControl['select'];
}

const [SelectContext, useSelect] = partContext<SelectState>('Select.Root');

interface SelectRowState {
  presentation: 'panel' | 'dialog';
  nativeID?: string;
  active: boolean;
  autoFocus?: boolean;
  /** Whether the keys put the highlight here rather than a cursor sweeping
   *  past: the ring is the keyboard's, the wash is the pointer's. */
  keyed?: boolean;
  onHoverIn?: () => void;
  onPicked?: () => void;
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
