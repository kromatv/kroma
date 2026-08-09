// <Select>: one value from a list. The trigger is shared; where the options
// appear is the platform's decision (see ./select-options): a <Dialog> under a
// D-pad (on tvOS a modal is its own view controller, so the remote is
// confined to the options) and an anchored listbox popover under a pointer,
// with the combobox keyboard the browser's native select taught everyone.

import { useCallback, useRef, useState } from 'react';
import type { StyleProp, View, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { sv } from '#ui/core';
import { bySize, CONTROL, type ControlSize, entryDefaultSize } from '#ui/lib/field-shell';
import { useControllable } from '#ui/lib/use-controllable';
import { SelectOptions } from './select-options';

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

interface SelectOption {
  value: string;
  label: string;
  note?: string;
  icon?: IconName;
  disabled?: boolean;
}

interface SelectProps extends Omit<FocusableProps, 'children' | 'onPress' | 'style'> {
  label: string;
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  placeholder?: string;
  invalid?: boolean;
  /** Stretch to the width of the parent. */
  block?: boolean;
  /** The control shell's size; see <TextField>. */
  size?: ControlSize;
  style?: StyleProp<ViewStyle>;
}

function Select({
  label,
  options,
  value: valueProp,
  defaultValue,
  onChange,
  // No default text: the product is not in this file's language, so an unset
  // select renders blank unless the caller passes a translated placeholder.
  placeholder,
  disabled = false,
  invalid = false,
  block = false,
  size,
  style,
  ...focusProps
}: Readonly<SelectProps>) {
  const shell = size ?? entryDefaultSize();
  // '' is "nothing picked": no option may use it, or the placeholder never shows.
  const [value, setValue] = useControllable(valueProp, defaultValue ?? '', onChange);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const trigger = useRef<View>(null);
  const current = options.find((option) => option.value === value);

  const pick = useCallback(
    (next: string) => {
      setValue(next);
      setOpen(false);
    },
    [setValue],
  );

  return (
    <>
      <Focusable
        {...focusProps}
        ref={trigger}
        role="combobox"
        expanded={open}
        label={current ? `${label}: ${current.label}` : (placeholder ?? label)}
        disabled={disabled}
        onPress={() => setOpen(true)}
        sv={triggerVariants}
        vars={{ size: shell, invalid, filled: current !== undefined, block }}
        style={style}
      >
        {(state) => (
          <>
            {current?.icon ? <Icon name={current.icon} size={18} color="textMuted" /> : null}
            <Txt variant="body" lines={1} style={state.slots.ink}>
              {current?.label ?? placeholder ?? ''}
            </Txt>
            <Box flex />
            <Icon name="chevron-down" size={16} color="textDim" />
          </>
        )}
      </Focusable>

      <SelectOptions
        open={open}
        onClose={close}
        label={label}
        options={options}
        value={value}
        onPick={pick}
        anchor={trigger}
      />
    </>
  );
}

export type { SelectOption, SelectProps };
export { Select, triggerVariants as selectTriggerVariants };
