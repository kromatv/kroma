// The web's two presentations of <Select>'s options. Inside a focus scope (a
// TV shell in a browser) the D-pad rules and the dialog presentation stands;
// unscoped - the desktop and phone browser - the options are an anchored
// listbox popover with the combobox keyboard: arrows move the active option,
// Home/End jump, printable keys type ahead, Enter picks, Esc returns to the
// trigger. DOM focus stays on the list and `aria-activedescendant` names the
// active row, so the pattern reads to assistive tech the way it looks.

import { useEffect, useId, useRef, useState } from 'react';
import { Pressable, ScrollView, type View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import {
  PANEL_BACKDROP,
  PANEL_SHELL,
  useAnchoredPlacement,
  useListKeys,
  useTriggerFocus,
} from '#ui/lib/anchored-panel';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { Portal } from '#ui/lib/portal';
import { useTDefault } from '#ui/services/i18n';
import { type SelectOption, SelectRowContext, type SelectRowState } from './select-context';
import { SelectOptionsDialog } from './select-options-dialog';
import type { SelectSurfaceProps } from './select-surface';

function SelectOptions(props: Readonly<SelectSurfaceProps>) {
  const scoped = useInsideFocusScope();
  if (scoped) return <SelectOptionsDialog {...props} />;
  return props.open ? <SelectPopover {...props} /> : null;
}

function element(ref: { current: unknown }): HTMLElement | null {
  return ref.current as HTMLElement | null;
}

const MIN_WIDTH = 160;
const MAX_HEIGHT = 320;
const ROW_GUESS = 44;
const PANEL_PAD = 6;
// Concentric with the rows inside it: the row radius plus PANEL_PAD.
const PANEL_RADIUS = 'xl';

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
  const t = useTDefault();
  const baseId = useId();
  const list = useRef<View>(null);
  const rows = useRef(new Map<number, number>());
  const [active, setActive] = useState(() => firstEnabled(options, value));

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

  useEffect(() => {
    const trigger = element(anchor);
    if (!trigger) return;
    const onKey = (event: KeyboardEvent) => {
      onKeyDown({
        nativeEvent: { key: event.key },
        preventDefault: () => event.preventDefault(),
        stopPropagation: () => event.stopPropagation(),
      });
    };
    trigger.addEventListener('keydown', onKey);
    trigger.setAttribute('aria-controls', `${baseId}-list`);
    trigger.setAttribute('aria-haspopup', LISTBOX);
    return () => {
      trigger.removeEventListener('keydown', onKey);
      trigger.removeAttribute('aria-controls');
      trigger.removeAttribute('aria-haspopup');
    };
  }, [anchor, baseId, onKeyDown]);

  useEffect(() => {
    const trigger = element(anchor);
    if (!trigger) return;
    trigger.setAttribute('aria-activedescendant', `${baseId}-${active}`);
    return () => trigger.removeAttribute('aria-activedescendant');
  }, [anchor, baseId, active]);

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
    onHoverIn: () => setActive(index),
    onLayout: (y) => rows.current.set(index, y),
  });

  if (!at) return null;

  return (
    <Portal>
      {/* The world behind the panel: one press anywhere out there closes it. */}
      <Pressable
        accessibilityLabel={t('common.close')}
        tabIndex={-1}
        onPress={() => onDismiss('outside')}
        style={PANEL_BACKDROP}
      />
      <Box
        ref={list}
        nativeID={`${baseId}-list`}
        role={LISTBOX}
        accessibilityLabel={label}
        radius={PANEL_RADIUS}
        border="borderStrong"
        bg="surface2"
        shadow="pop"
        overflow="hidden"
        style={[
          PANEL_SHELL,
          {
            left: at.left,
            top: at.top,
            bottom: at.bottom,
            minWidth: at.width,
            maxWidth: at.maxWidth,
          },
        ]}
      >
        <ScrollView ref={scroller} style={{ maxHeight: at.maxHeight }}>
          <Box p={PANEL_PAD}>
            {items.map((item, index) => (
              <SelectRowContext.Provider key={item.key} value={row(index)}>
                {item}
              </SelectRowContext.Provider>
            ))}
          </Box>
        </ScrollView>
      </Box>
    </Portal>
  );
}

// `listbox` reaches the DOM through react-native-web even though React
// Native's `Role` union stops short of it.
const LISTBOX = 'listbox' as import('react-native').Role;

export { SelectOptions };
