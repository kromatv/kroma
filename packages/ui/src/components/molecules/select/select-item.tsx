// One option, in both presentations: a row of the D-pad dialog, and a row of
// the pointer's anchored listbox. Which one it renders is the surface's
// decision, handed down through the row context.

import { Children, isValidElement, type ReactNode, useMemo } from 'react';
import { Pressable, type StyleProp, type TextStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { CheckboxFace } from '#ui/components/atoms/checkbox';
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
    ink: { grow: 1, shrink: 1 },
  },
  variants: {
    chosen: { true: { ink: { color: 'text' } }, false: { ink: { color: 'textMuted' } } },
  },
  defaults: { chosen: false },
});

interface SelectItemProps {
  value: string;
  /** The row. A DIRECT <Select.Media> child is its head, wherever it is
   *  written; a plain string beside it IS the label; anything else is the row
   *  itself, and then `label` is what the trigger and assistive tech read. */
  children?: ReactNode;
  label?: string;
  /** The fact that settles the choice: a bitrate, a codec, a count. */
  note?: string;
  /** The head of the row, as a glyph the kit can size. A mark it cannot size
   *  goes through <Select.Media>, which wins the head from it. */
  icon?: IconName;
  disabled?: boolean;
}

interface Sorted {
  media: ReactNode[];
  body: ReactNode[];
}

function sort(children: ReactNode): Sorted {
  const at: Sorted = { media: [], body: [] };
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === Media) at.media.push(child);
    else at.body.push(child);
  }
  return at;
}

function textOf(body: readonly ReactNode[]): string | undefined {
  if (body.length !== 1) return undefined;
  const [only] = body;
  if (typeof only === 'string') return only;
  if (typeof only === 'number') return String(only);
  return undefined;
}

/** The descriptor a <Select.Item> declares: what names it in the trigger, and
 *  what the listbox keyboard types ahead over. */
function optionOf(props: Readonly<SelectItemProps>): SelectOption {
  return {
    value: props.value,
    label: props.label ?? textOf(sort(props.children).body) ?? props.value,
    note: props.note,
    disabled: props.disabled,
  };
}

/** The head a <Select.Item> declares: a written <Select.Media>, else the `icon`
 *  sugar. The Root keys these by value, so the trigger draws the pick's. */
function mediaOf(props: Readonly<SelectItemProps>): ReactNode {
  const { media } = sort(props.children);
  if (media.length > 0) return media;
  if (props.icon === undefined) return null;
  return <Media name={props.icon} />;
}

function Item(props: Readonly<SelectItemProps>) {
  const { value, children, disabled = false } = props;
  const { values, pick } = useSelect('Item');
  const row = useSelectRow();
  const option = optionOf(props);
  const chosen = values.includes(value);
  const state = useMemo(() => ({ value, chosen }), [value, chosen]);
  const body = sort(children).body;
  const composed = body.length > 0 && textOf(body) === undefined;
  const content = (ink: StyleProp<TextStyle>) => (
    <>
      {mediaOf(props)}
      {composed ? body : <ItemRow option={option} ink={ink} />}
    </>
  );

  if (row.presentation === 'panel') {
    const slots = optionVariants({ chosen });
    return (
      <SelectItemContext.Provider value={state}>
        <Pressable
          nativeID={row.nativeID}
          role="option"
          aria-label={option.label}
          aria-selected={chosen}
          aria-disabled={disabled}
          tabIndex={-1}
          onPress={() => {
            if (disabled) return;
            pick(value);
            row.onPicked?.();
          }}
          onHoverIn={row.onHoverIn}
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            row.onLayout?.(y, height);
          }}
          style={[
            slots.root,
            s.row,
            row.active ? s.active : null,
            row.active && row.keyed ? s.keyed : null,
            disabled ? s.disabled : null,
          ]}
        >
          {content(slots.ink)}
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
        {(focus) => content(focus.slots.ink)}
      </Focusable>
    </SelectItemContext.Provider>
  );
}

function ItemRow({ option, ink }: Readonly<{ option: SelectOption; ink: StyleProp<TextStyle> }>) {
  return (
    <>
      <Text variant="body" lines={1} style={ink}>
        {option.label}
      </Text>
      {option.note ? (
        <Text variant="meta" color="textDim">
          {option.note}
        </Text>
      ) : null}
      <Indicator />
    </>
  );
}

const GLYPH = 18;

/** The mark that stands for an option, at the head of its row and again in the
 *  trigger once that row is the pick. <Select.Item>'s `icon` is the sugar for
 *  the common case; write this instead where the mark is the option's own. */
function Media({
  name,
  children,
}: Readonly<{
  name?: IconName;
  /** A mark the kit cannot size: give it 18px, so a column of faces lines up
   *  with a column of glyphs. */
  children?: ReactNode;
}>) {
  if (name) return <Icon name={name} size={GLYPH} color="textMuted" />;
  return <Box shrink={0}>{children}</Box>;
}

/** The picked row's face: a tick, or a checkbox where several rows can be
 *  picked at once. <Select.Item> draws it for you; name it yourself only when
 *  the row's arrangement puts it somewhere else. */
function Indicator() {
  const { multiple } = useSelect('Indicator');
  const { chosen } = useSelectItem('Indicator');
  if (multiple) return <CheckboxFace checked={chosen} />;
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
export { Indicator, Item, Media, mediaOf, optionOf };
