// The web's two presentations of <Select>'s options. Inside a focus scope (a
// TV shell in a browser) the D-pad rules and the dialog presentation stands;
// unscoped - the desktop and phone browser - the options are an anchored
// listbox popover with the combobox keyboard: arrows move the active option,
// Home/End jump, printable keys type ahead, Enter picks, Esc returns to the
// trigger. DOM focus stays on the list and `aria-activedescendant` names the
// active row, so the pattern reads to assistive tech the way it looks.

import { useEffect, useId, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';
import {
  useActiveDescendant,
  useAnchoredPlacement,
  useListKeys,
  useTriggerFocus,
  useTriggerKeys,
} from '#ui/lib/anchored-panel';
import { AnchoredPopup } from '#ui/lib/anchored-popup';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { useFocusVisible } from '#ui/lib/focus-visible';
import { type SelectOption, SelectRowContext, type SelectRowState } from './select-context';
import { SelectOptionsDialog } from './select-options-dialog';
import type { SelectSurfaceProps } from './select-surface';

function SelectOptions(props: Readonly<SelectSurfaceProps>) {
  const scoped = useInsideFocusScope();
  if (scoped) return <SelectOptionsDialog {...props} />;
  return props.open ? <SelectPopover {...props} /> : null;
}

const MIN_WIDTH = 160;
const MAX_HEIGHT = 320;
const ROW_GUESS = 44;

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
  const rows = useRef(new Map<number, number>());
  const [active, setActive] = useState(() => firstEnabled(options, value));
  const keyed = useFocusVisible(active);

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

  // Keep the active row in sight as the keyboard walks the list.
  const scroller = useRef<ScrollView>(null);
  useEffect(() => {
    const y = rows.current.get(active);
    const el = scroller.current as unknown as { getScrollableNode?: () => HTMLElement } | null;
    const node = el?.getScrollableNode?.();
    if (y === undefined || !node) return;
    if (y < node.scrollTop) node.scrollTop = y;
    else if (y + ROW_GUESS > node.scrollTop + node.clientHeight) {
      node.scrollTop = y + ROW_GUESS - node.clientHeight;
    }
  }, [active]);

  const row = (index: number): SelectRowState => ({
    presentation: 'panel',
    nativeID: `${baseId}-${index}`,
    active: index === active,
    keyed,
    onHoverIn: () => setActive(index),
    onLayout: (y) => rows.current.set(index, y),
  });

  if (!at) return null;

  return (
    <AnchoredPopup
      at={at}
      role={LISTBOX}
      label={label}
      listId={`${baseId}-list`}
      onDismiss={() => onDismiss('outside')}
      scrollRef={scroller}
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
