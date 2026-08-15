// <Select>: one value from a list. The trigger is shared; where the options
// appear is the platform's decision (see ./select-options): a <Dialog> under a
// D-pad (on tvOS a modal is its own view controller, so the remote is
// confined to the options) and an anchored listbox popover under a pointer,
// with the combobox keyboard the browser's native select taught everyone.

import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';
import type { StyleProp, View, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { sv } from '#ui/core';
import { bySize, CONTROL, type ControlSize, entryDefaultSize } from '#ui/lib/field-shell';
import { useControllable } from '#ui/lib/use-controllable';
import {
  SelectContext,
  type SelectDismissReason,
  SelectInkContext,
  type SelectOpenDetails,
  type SelectOpenReason,
  type SelectOption,
  type SelectState,
  type SelectValueDetails,
  useSelect,
} from './select-context';
import { Indicator, Item, optionOf, type SelectItemProps } from './select-item';
import { SelectOptions } from './select-options';
import type { SelectPresentation } from './select-surface';

// The trigger IS a field: same well, same metrics table, so a select and an
// entry on one row are the same shape and height (see lib/field-shell).
const triggerVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      bg: CONTROL.md.bg,
      border: 'borderStrong',
      _hover: { bg: 'surface3' },
    },
    ink: { shrink: 1 },
  },
  variants: {
    size: bySize((m) => ({
      root: { gap: m.gap, px: m.px, py: m.py, radius: m.radius, minH: m.line },
      ink: { fontSize: m.fontSize, lineHeight: m.line },
    })),
    invalid: { true: { root: { border: 'danger' } } },
    filled: { true: { ink: { color: 'text' } }, false: { ink: { color: 'textDim' } } },
    block: { true: { root: { self: 'stretch' } } },
  },
  defaults: { size: 'md', invalid: false, filled: false, block: false },
});

interface SelectRootProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (next: string, details: SelectValueDetails) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, details: SelectOpenDetails) => void;
  /** Names the control to assistive tech; the trigger announces it with what is
   *  picked. Falls back to `placeholder`. */
  label?: string;
  /** What the trigger reads before anything is picked. No default: the product
   *  is not in this file's language. */
  placeholder?: string;
  /** Where the options appear: `auto` (the default) asks the platform - a
   *  dialog under a D-pad, an anchored popover under a pointer - and naming one
   *  overrides it. `panel` has no native implementation and falls back to the
   *  dialog there. */
  presentation?: SelectPresentation;
  disabled?: boolean;
  /** A <Select.Trigger> and the <Select.Item>s, in any order. Only DIRECT
   *  children are collected as options. */
  children: ReactNode;
}

function isItem(node: ReactNode): node is ReactElement<SelectItemProps> {
  return isValidElement(node) && node.type === Item;
}

function Root({
  value: valueProp,
  defaultValue,
  onValueChange,
  open: openProp,
  defaultOpen,
  onOpenChange,
  label,
  placeholder,
  presentation = 'auto',
  disabled = false,
  children,
}: Readonly<SelectRootProps>) {
  // '' is "nothing picked": no option may use it, or the placeholder never shows.
  const [value, setValue] = useControllable(valueProp, defaultValue ?? '');
  const [open, setOpenState] = useControllable(openProp, defaultOpen ?? false);
  const anchor = useRef<View>(null);

  const kids = useMemo(() => Children.toArray(children), [children]);
  const items = useMemo(() => kids.filter(isItem), [kids]);
  const options = useMemo(() => items.map((item) => optionOf(item.props)), [items]);
  const current = options.find((option) => option.value === value);

  const setOpen = useCallback(
    (next: boolean, reason: SelectOpenReason) => {
      setOpenState(next);
      onOpenChange?.(next, { reason });
    },
    [setOpenState, onOpenChange],
  );

  const pick = useCallback(
    (next: string) => {
      const item = options.find((option) => option.value === next);
      setValue(next);
      if (item) onValueChange?.(next, { item });
      setOpen(false, 'select');
    },
    [options, setValue, onValueChange, setOpen],
  );

  const state = useMemo<SelectState>(
    () => ({ value, current, label, placeholder, open, disabled, anchor, setOpen, pick }),
    [value, current, label, placeholder, open, disabled, setOpen, pick],
  );

  return (
    <SelectContext.Provider value={state}>
      {kids.filter((node) => !isItem(node))}
      <SelectOptions
        open={open}
        presentation={presentation}
        label={label ?? placeholder}
        options={options}
        items={items}
        value={value}
        onPick={pick}
        onDismiss={(reason: SelectDismissReason) => setOpen(false, reason)}
        anchor={anchor}
      />
    </SelectContext.Provider>
  );
}

interface SelectTriggerProps
  extends Omit<
    FocusableProps,
    'children' | 'sv' | 'vars' | 'role' | 'label' | 'expanded' | 'disabled' | 'onPress' | 'style'
  > {
  /** The control shell's size; see <TextField>. */
  size?: ControlSize;
  invalid?: boolean;
  /** Stretch to the width of the parent. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  /** What the well holds. Defaults to <Select.Value>; the chevron is drawn
   *  after it either way. */
  children?: ReactNode;
}

function Trigger({
  size,
  invalid = false,
  block = false,
  style,
  children,
  ...focusProps
}: Readonly<SelectTriggerProps>) {
  const { label, placeholder, current, open, disabled, anchor, setOpen } = useSelect('Trigger');
  const shell = size ?? entryDefaultSize();
  return (
    <Focusable
      {...focusProps}
      ref={anchor}
      role="combobox"
      expanded={open}
      label={triggerName(label, placeholder, current)}
      disabled={disabled}
      onPress={() => setOpen(true, 'trigger')}
      sv={triggerVariants}
      vars={{ size: shell, invalid, filled: current !== undefined, block }}
      style={style}
    >
      {(state) => (
        <>
          <SelectInkContext.Provider value={state.slots.ink}>
            {children ?? <Value />}
          </SelectInkContext.Provider>
          <Box flex />
          <Icon name="chevron-down" size={16} color="textDim" />
        </>
      )}
    </Focusable>
  );
}

function triggerName(
  label: string | undefined,
  placeholder: string | undefined,
  current: SelectOption | undefined,
): string | undefined {
  if (!current) return label ?? placeholder;
  return label ? `${label}: ${current.label}` : current.label;
}

/** What is picked, rendered inside the trigger: the option's icon and label, or
 *  the placeholder while nothing is. */
function Value() {
  const { current, placeholder } = useSelect('Value');
  const ink = useContext(SelectInkContext);
  return (
    <>
      {current?.icon ? <Icon name={current.icon} size={18} color="textMuted" /> : null}
      <Text variant="body" lines={1} style={ink}>
        {current?.label ?? placeholder ?? ''}
      </Text>
    </>
  );
}

const Select = { Root, Trigger, Value, Item, Indicator };

export type {
  SelectDismissReason,
  SelectItemProps,
  SelectOpenDetails,
  SelectOpenReason,
  SelectOption,
  SelectPresentation,
  SelectRootProps,
  SelectTriggerProps,
  SelectValueDetails,
};
export { Select, triggerVariants as selectTriggerVariants };
