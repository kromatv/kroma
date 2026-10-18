import type { ControlSize } from '#ui/lib/field-shell';
import { partContext } from '#ui/lib/part-context';

interface SelectionBarState {
  size: ControlSize;
  compact: boolean;
  onClear: () => void;
}

const [SelectionBarContext, useSelectionBar] = partContext<SelectionBarState>('SelectionBar.Root');

export type { SelectionBarState };
export { SelectionBarContext, useSelectionBar };
