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

import { type ReactNode, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { CheckboxFace, type CheckboxSize } from '#ui/components/atoms/checkbox';
import { RadioFace } from '#ui/components/atoms/radio';
import { Text } from '#ui/components/atoms/text';
import { ListRow } from '#ui/components/molecules/list-row';
import type { ControlSize } from '#ui/lib/field-shell';
import { partContext } from '#ui/lib/part-context';
import { useStableCallback } from '#ui/lib/stable-callback';

const FACE: Record<ControlSize, CheckboxSize> = { sm: 'sm', md: 'sm', tv: 'tv' };

interface ChoiceContext {
  mode: 'single' | 'multiple';
  size: ControlSize;
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
  const { label, size = 'sm', gap = 8, style, children } = props;
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
      picked: (v) => (many ? (value as readonly string[]).includes(v) : value === v),
      toggle,
    }),
    [many, size, value, toggle],
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
   *  label's plain text is also the row's accessible name. */
  children?: ReactNode;
  /** Trailing controls (an edit or delete button); they keep their own focus. */
  actions?: ReactNode;
}

function Item({ value, disabled, children, actions }: Readonly<ItemProps>) {
  const { mode, size, picked, toggle } = useChoice('Item');
  const on = picked(value);
  const item = useMemo(() => ({ value, on }), [value, on]);
  return (
    <ItemContext.Provider value={item}>
      <ListRow.Root
        size={size}
        disabled={disabled}
        role={mode === 'multiple' ? 'checkbox' : 'radio'}
        checked={on}
        chevron={false}
        onPress={() => toggle(value)}
      >
        <ListRow.Leading>
          <Indicator />
        </ListRow.Leading>
        {children}
        {actions ? <ListRow.Trailing>{actions}</ListRow.Trailing> : null}
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

/** The row's title. */
function Label({ children }: Readonly<{ children: ReactNode }>) {
  const { size } = useChoice('Label');
  return (
    <Text variant={size === 'tv' ? 'title' : 'label'} lines={1}>
      {children}
    </Text>
  );
}

/** The quieter second line: the fact that settles the choice. */
function Hint({ children }: Readonly<{ children: ReactNode }>) {
  const { size } = useChoice('Hint');
  return (
    <Text variant={size === 'tv' ? 'body' : 'meta'} color="textDim" lines={2}>
      {children}
    </Text>
  );
}

const ChoiceList = { Root, Item, Indicator, Label, Hint };

export type { ChoiceRootProps, ItemProps as ChoiceItemProps, MultipleRootProps, SingleRootProps };
export { ChoiceList };
