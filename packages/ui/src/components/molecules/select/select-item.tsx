// One option, in both presentations: a row of the D-pad dialog, and a row of
// the pointer's anchored listbox. Which one it renders is the surface's
// decision, handed down through the row context.

import { type ReactNode, useMemo } from 'react';
import { Pressable, type StyleProp, type TextStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { styles, sv } from '#ui/core';
import { CONTROL } from '#ui/lib/field-shell';
import {
  SelectItemContext,
  type SelectOption,
  useSelect,
  useSelectItem,
  useSelectRow,
} from './select-context';

const optionVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 12,
      px: 14,
      py: 12,
      radius: 'md',
      _hover: { bg: 'tint/8' },
    },
    ink: { shrink: 1 },
  },
  variants: {
    chosen: { true: { ink: { color: 'text' } }, false: { ink: { color: 'textMuted' } } },
  },
  defaults: { chosen: false },
});

interface SelectItemProps {
  value: string;
  /** The row. A plain string child IS the label; anything else is the row
   *  itself, and then `label` is what the trigger and assistive tech read. */
  children?: ReactNode;
  label?: string;
  /** The fact that settles the choice: a bitrate, a codec, a count. */
  note?: string;
  icon?: IconName;
  disabled?: boolean;
}

function textOf(children: ReactNode): string | undefined {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  return undefined;
}

function labelOf(props: Readonly<SelectItemProps>): string {
  return props.label ?? textOf(props.children) ?? props.value;
}

/** The descriptor a <Select.Item> declares: what the trigger renders when it is
 *  the pick, and what the listbox keyboard types ahead over. */
function optionOf(props: Readonly<SelectItemProps>): SelectOption {
  return {
    value: props.value,
    label: labelOf(props),
    note: props.note,
    icon: props.icon,
    disabled: props.disabled,
  };
}

function Item(props: Readonly<SelectItemProps>) {
  const { value, children, disabled = false } = props;
  const { value: picked, pick } = useSelect('Item');
  const row = useSelectRow();
  const option = optionOf(props);
  const chosen = value === picked;
  const state = useMemo(() => ({ value, chosen }), [value, chosen]);
  const composed = children !== undefined && textOf(children) === undefined;
  const body = (ink: StyleProp<TextStyle>) =>
    composed ? children : <ItemRow option={option} ink={ink} />;

  if (row.presentation === 'panel') {
    const slots = optionVariants({ chosen });
    return (
      <SelectItemContext.Provider value={state}>
        <Pressable
          nativeID={row.nativeID}
          role="option"
          aria-label={option.label}
          // The panel is a web-only presentation, and react-native-web reads
          // the flat aria props rather than the state object.
          aria-selected={chosen}
          aria-disabled={disabled}
          tabIndex={-1}
          onPress={() => {
            if (!disabled) pick(value);
          }}
          onHoverIn={row.onHoverIn}
          onLayout={(event) => row.onLayout?.(event.nativeEvent.layout.y)}
          style={[
            slots.root,
            s.row,
            row.active ? s.active : null,
            row.active && row.keyed ? s.keyed : null,
            disabled ? s.disabled : null,
          ]}
        >
          {body(slots.ink)}
        </Pressable>
      </SelectItemContext.Provider>
    );
  }

  return (
    <SelectItemContext.Provider value={state}>
      <Focusable
        role="option"
        selected={chosen}
        label={option.label}
        disabled={disabled}
        onPress={() => pick(value)}
        sv={optionVariants}
        vars={{ chosen }}
      >
        {(focus) => body(focus.slots.ink)}
      </Focusable>
    </SelectItemContext.Provider>
  );
}

function ItemRow({ option, ink }: Readonly<{ option: SelectOption; ink: StyleProp<TextStyle> }>) {
  return (
    <>
      {option.icon ? <Icon name={option.icon} size={18} color="textMuted" /> : null}
      <Text variant="body" lines={1} style={ink}>
        {option.label}
      </Text>
      <Box flex />
      {option.note ? (
        <Text variant="meta" color="textDim">
          {option.note}
        </Text>
      ) : null}
      <Indicator />
    </>
  );
}

/** The tick on the picked row. <Select.Item> draws it for you; name it yourself
 *  only when the row's arrangement puts it somewhere else. */
function Indicator() {
  const { chosen } = useSelectItem('Indicator');
  return (
    <Box w={18} align="center">
      {chosen ? <Icon name="check" size={16} color="accentText" /> : null}
    </Box>
  );
}

const s = styles({
  row: { radius: CONTROL.sm.radius },
  active: { bg: 'tint/8' },
  // On the edge: the rows abut, so a gap either way lands on something.
  keyed: { ring: 'focusEdge' },
  disabled: { opacity: 0.4 },
});

export type { SelectItemProps };
export { Indicator, Item, optionOf };
