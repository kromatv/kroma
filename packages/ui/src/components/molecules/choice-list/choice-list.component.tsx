// <ChoiceList>: a list whose rows ARE the control. Pick one (radio) or pick
// several (checkbox), each row optionally carrying its own actions.
//
// Composed, in Radix's shape: a Root that owns the value and the semantics,
// Items that read it through context, and named parts for the pieces a row is
// made of. The reason is the same reason Radix gives - a row is not a fixed
// arrangement of label + hint, and a props-only API answers every new demand
// with another prop until the component is a switchboard. Here the caller
// writes the row.
//
// `ChoiceList.Item` composes <ListRow>, so the WHOLE row is the target: one
// D-pad stop per row rather than two, and a pointer hit area the size of the
// thing a reader is aiming at. The indicator is drawn as a face and the ROW
// carries `radio`/`checkbox` with its state to assistive tech.

import { Children, isValidElement, type ReactNode, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { CheckboxFace, type CheckboxSize } from '#ui/components/atoms/checkbox';
import type { IconName } from '#ui/components/atoms/icon';
import { IconWell } from '#ui/components/atoms/icon-well';
import { RadioFace } from '#ui/components/atoms/radio';
import { Text } from '#ui/components/atoms/text';
import { ListRow, type RowGround } from '#ui/components/molecules/list-row';
import { styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import type { ControlSize } from '#ui/lib/field-shell';
import { partContext } from '#ui/lib/part-context';
import { useStableCallback } from '#ui/lib/stable-callback.hook';

const FACE: Record<ControlSize, CheckboxSize> = { sm: 'sm', md: 'sm', tv: 'tv' };

interface ChoiceContext {
  mode: 'single' | 'multiple';
  size: ControlSize;
  ground: RowGround;
  picked: (value: string) => boolean;
  toggle: (value: string) => void;
}

const [Context, useChoice] = partContext<ChoiceContext>('ChoiceList.Root');

// One item's own value, so the parts under it need no prop of their own.
const [ItemContext, useItem] = partContext<{ value: string; on: boolean }>('ChoiceList.Item');

interface RootBase {
  /** Names the group to assistive tech: what the choices are choices OF. */
  label: string;
  size?: ControlSize;
  /** What the rows are drawn on, as `<ListRow.Root ground>` says. On a
   *  `surface` each choice is a card, and the chosen one wears the accent. */
  ground?: RowGround;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

interface SingleRootProps extends RootBase {
  mode?: 'single';
  value: string | null;
  onValueChange: (next: string) => void;
}

interface MultipleRootProps extends RootBase {
  mode: 'multiple';
  value: readonly string[];
  onValueChange: (next: string[]) => void;
}

type ChoiceRootProps = SingleRootProps | MultipleRootProps;

function Root(props: Readonly<ChoiceRootProps>) {
  const { label, size = 'sm', ground = 'artwork', gap = 8, style, children } = props;
  const many = props.mode === 'multiple';
  const value = props.value;
  const onValueChange = props.onValueChange;

  // Stable, because it is every row's `onPress`: rebuilt with the rest of the
  // context, picking one row re-rendered all of them.
  const toggle = useStableCallback((v: string) => {
    if (!many) {
      (onValueChange as (next: string) => void)(v);
      return;
    }
    const current = value as readonly string[];
    (onValueChange as (next: string[]) => void)(
      current.includes(v) ? current.filter((x) => x !== v) : [...current, v],
    );
  });

  const ctx = useMemo<ChoiceContext>(
    () => ({
      mode: many ? 'multiple' : 'single',
      size,
      ground,
      picked: (v) => (many ? (value as readonly string[]).includes(v) : value === v),
      toggle,
    }),
    [many, size, ground, value, toggle],
  );

  return (
    <Context.Provider value={ctx}>
      <Box
        gap={gap}
        // `radiogroup` is the one-of-N contract; a set of checkboxes is a
        // plain labelled group, because each row answers on its own.
        role={many ? 'group' : 'radiogroup'}
        accessibilityLabel={label}
        style={style}
      >
        {children}
      </Box>
    </Context.Provider>
  );
}

interface ItemProps {
  value: string;
  disabled?: boolean;
  /** The row: a <ChoiceList.Label>, and a <ChoiceList.Hint> under it. The
   *  label's plain text is also the row's accessible name. A DIRECT
   *  <ChoiceList.Media> leads the row, and the indicator moves to its end. */
  children?: ReactNode;
  /** Trailing controls (an edit or delete button); they keep their own focus. */
  actions?: ReactNode;
}

function isMedia(child: ReactNode): boolean {
  return isValidElement(child) && child.type === Media;
}

function splitMedia(children: ReactNode) {
  const all = Children.toArray(children);
  return { media: all.find(isMedia), rest: all.filter((child) => !isMedia(child)) };
}

function Item({ value, disabled, children, actions }: Readonly<ItemProps>) {
  const s = useStyles(sDefinition);
  const { mode, size, ground, picked, toggle } = useChoice('Item');
  const on = picked(value);
  const item = useMemo(() => ({ value, on }), [value, on]);
  const { media, rest } = splitMedia(children);
  return (
    <ItemContext.Provider value={item}>
      <ListRow.Root
        size={size}
        ground={ground}
        disabled={disabled}
        role={mode === 'multiple' ? 'checkbox' : 'radio'}
        checked={on}
        chevron={false}
        onPress={() => toggle(value)}
        style={on && ground === 'surface' ? s.chosen : undefined}
      >
        <ListRow.Leading>{media ?? <Indicator />}</ListRow.Leading>
        {rest}
        <ListRow.Trailing>
          {actions}
          {media ? <Indicator /> : null}
        </ListRow.Trailing>
      </ListRow.Root>
    </ItemContext.Provider>
  );
}

/** The checkbox or radio face. Rendered for you by <Item>; name it yourself
 *  only when the row's arrangement puts it somewhere else. */
function Indicator() {
  const { mode, size } = useChoice('Indicator');
  const { on } = useItem('Indicator');
  return mode === 'multiple' ? (
    <CheckboxFace checked={on} size={FACE[size]} />
  ) : (
    <RadioFace checked={on} size={FACE[size]} />
  );
}

/** The row's title: one line, or two on a card. */
function Label({ children }: Readonly<{ children: ReactNode }>) {
  const { size, ground } = useChoice('Label');
  return (
    <Text variant={size === 'tv' ? 'title' : 'label'} lines={ground === 'surface' ? 2 : 1}>
      {children}
    </Text>
  );
}

/** The quieter second line: the fact that settles the choice. Two lines at
 *  most on a row, whole on a card. */
function Hint({ children }: Readonly<{ children: ReactNode }>) {
  const { size, ground } = useChoice('Hint');
  return (
    <Text
      variant={size === 'tv' ? 'body' : 'meta'}
      color="textDim"
      lines={ground === 'surface' ? undefined : 2}
    >
      {children}
    </Text>
  );
}

interface ChoiceMediaProps {
  /** A glyph, sunk into the kit's icon well. Media that is not a glyph, such
   *  as a logo, goes in as children instead. */
  name?: IconName;
  children?: ReactNode;
}

/** The mark that stands for the choice: a glyph, a logo, a poster. */
function Media({ name, children }: Readonly<ChoiceMediaProps>) {
  const { size } = useChoice('Media');
  if (name) {
    return <IconWell name={name} size={FACE[size]} />;
  }
  return <>{children}</>;
}

const sDefinition = styles({
  chosen: { bg: 'accentSoft', border: 'accent' },
});

const ChoiceList = { Root, Item, Media, Indicator, Label, Hint };

export type {
  ChoiceMediaProps,
  ChoiceRootProps,
  ItemProps as ChoiceItemProps,
  MultipleRootProps,
  SingleRootProps,
};
export { ChoiceList };
