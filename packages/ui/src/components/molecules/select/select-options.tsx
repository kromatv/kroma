// <Select>'s two presentations of its options, and the one thing that picks
// between them: the dialog a D-pad drives, and the anchored listbox popover a
// pointer drives.

import { useId, useState } from 'react';
import { useListKeys, useRowInView } from '#ui/lib/anchored-keys';
import {
  useActiveDescendant,
  useAnchoredPlacement,
  useTriggerFocus,
  useTriggerKeys,
} from '#ui/lib/anchored-panel';
import { AnchoredPopup } from '#ui/lib/anchored-popup';
import { useFocusVisible } from '#ui/lib/focus-visible';
import { useSurfacePresentation } from '#ui/lib/surface-presentation';
import { type SelectOption, SelectRowContext, type SelectRowState } from './select-context';
import { SelectOptionsDialog } from './select-options-dialog';
import type { SelectSurfaceProps } from './select-surface';

function SelectOptions(props: Readonly<SelectSurfaceProps>) {
  const presentation = useSurfacePresentation(props.presentation);
  if (presentation === 'dialog') return <SelectOptionsDialog {...props} />;
  return props.open ? <SelectPopover {...props} /> : null;
}

const MIN_WIDTH = 160;
const MAX_HEIGHT = 320;

function firstEnabled(options: readonly SelectOption[], value: string): number {
  const chosen = options.findIndex((option) => option.value === value && !option.disabled);
  if (chosen >= 0) return chosen;
  return Math.max(
    0,
    options.findIndex((option) => !option.disabled),
  );
}

function SelectPopover({
  onDismiss,
  label,
  options,
  items,
  value,
  onPick,
  anchor,
}: Readonly<SelectSurfaceProps>) {
  const baseId = useId();
  const [active, setActive] = useState(() => firstEnabled(options, value));
  const keyed = useFocusVisible(active);
  const { scroll, onRowLayout } = useRowInView(active);

  const at = useAnchoredPlacement(anchor, {
    minWidth: MIN_WIDTH,
    matchWidth: true,
    maxHeight: MAX_HEIGHT,
    grow: true,
  });
  useTriggerFocus(anchor);
  const { onKeyDown } = useListKeys({
    count: options.length,
    active,
    setActive,
    disabledAt: (i) => options[i]?.disabled === true,
    labelAt: (i) => options[i]?.label ?? '',
    onPick: (i) => {
      const option = options[i];
      if (option) onPick(option.value);
    },
    onClose: () => onDismiss('escape'),
  });

  useTriggerKeys(anchor, { listId: `${baseId}-list`, haspopup: LISTBOX, onKeyDown });
  useActiveDescendant(anchor, `${baseId}-${active}`);

  const row = (index: number): SelectRowState => ({
    presentation: 'panel',
    nativeID: `${baseId}-${index}`,
    active: index === active,
    keyed,
    onHoverIn: () => setActive(index),
    onLayout: (y, height) => onRowLayout(index, y, height),
  });

  if (!at) return null;

  return (
    <AnchoredPopup
      at={at}
      role={LISTBOX}
      label={label}
      listId={`${baseId}-list`}
      onDismiss={() => onDismiss('outside')}
      scroll={scroll}
    >
      {items.map((item, index) => (
        <SelectRowContext.Provider key={item.key} value={row(index)}>
          {item}
        </SelectRowContext.Provider>
      ))}
    </AnchoredPopup>
  );
}

// `listbox` reaches the DOM through react-native-web even though React
// Native's `Role` union stops short of it.
const LISTBOX = 'listbox' as import('react-native').Role;

export { SelectOptions };
