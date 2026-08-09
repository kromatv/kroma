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

import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { CheckboxFace } from '#ui/components/atoms/checkbox';
import { RadioFace } from '#ui/components/atoms/radio';
import { Txt } from '#ui/components/atoms/text';
import { ListRow, type ListRowSize } from '#ui/components/molecules/list-row';

interface ChoiceContext {
  mode: 'single' | 'multiple';
  size: ListRowSize;
  picked: (value: string) => boolean;
  toggle: (value: string) => void;
}

const Context = createContext<ChoiceContext | null>(null);

function useChoice(part: string): ChoiceContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error(`<ChoiceList.${part}> must be used inside <ChoiceList.Root>`);
  return ctx;
}

// One item's own value, so the parts under it need no prop of their own.
const ItemContext = createContext<{ value: string; on: boolean } | null>(null);

function useItem(part: string): { value: string; on: boolean } {
  const ctx = useContext(ItemContext);
  if (!ctx) throw new Error(`<ChoiceList.${part}> must be used inside <ChoiceList.Item>`);
  return ctx;
}

interface RootBase {
  /** Names the group to assistive tech: what the choices are choices OF. */
  label: string;
  size?: ListRowSize;
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

  const ctx = useMemo<ChoiceContext>(
    () => ({
      mode: many ? 'multiple' : 'single',
      size,
      picked: (v) => (many ? (value as readonly string[]).includes(v) : value === v),
      toggle: (v) => {
        if (!many) {
          (onValueChange as (next: string) => void)(v);
          return;
        }
        const current = value as readonly string[];
        (onValueChange as (next: string[]) => void)(
          current.includes(v) ? current.filter((x) => x !== v) : [...current, v],
        );
      },
    }),
    [many, size, value, onValueChange],
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
  /** The row's content. Omit it and the item renders `label`/`hint` for you,
   *  which is what most lists want. */
  children?: ReactNode;
  /** Sugar for the common row, equivalent to `<Indicator/><Label/><Hint/>`. */
  label?: string;
  hint?: string;
  /** Trailing controls (an edit or delete button); they keep their own focus. */
  actions?: ReactNode;
}

function Item({ value, disabled, children, label, hint, actions }: Readonly<ItemProps>) {
  const { mode, size, picked, toggle } = useChoice('Item');
  const on = picked(value);
  const item = useMemo(() => ({ value, on }), [value, on]);
  return (
    <ItemContext.Provider value={item}>
      <ListRow
        size={size}
        label={label ?? value}
        hint={children ? undefined : hint}
        disabled={disabled}
        role={mode === 'multiple' ? 'checkbox' : 'radio'}
        checked={on}
        onPress={() => toggle(value)}
        leading={<Indicator />}
        trailing={actions}
      >
        {children}
      </ListRow>
    </ItemContext.Provider>
  );
}

/** The checkbox or radio face. Rendered for you by <Item>; name it yourself
 *  only when the row's arrangement puts it somewhere else. */
function Indicator() {
  const { mode, size } = useChoice('Indicator');
  const { on } = useItem('Indicator');
  return mode === 'multiple' ? (
    <CheckboxFace checked={on} size={size} />
  ) : (
    <RadioFace checked={on} size={size} />
  );
}

/** The row's title. */
function Label({ children }: Readonly<{ children: ReactNode }>) {
  const { size } = useChoice('Label');
  return (
    <Txt variant={size === 'tv' ? 'title' : 'label'} lines={1}>
      {children}
    </Txt>
  );
}

/** The quieter second line: the fact that settles the choice. */
function Hint({ children }: Readonly<{ children: ReactNode }>) {
  const { size } = useChoice('Hint');
  return (
    <Txt variant={size === 'tv' ? 'body' : 'meta'} color="textDim" lines={2}>
      {children}
    </Txt>
  );
}

const ChoiceList = { Root, Item, Indicator, Label, Hint };

export type { ChoiceRootProps, ItemProps as ChoiceItemProps, MultipleRootProps, SingleRootProps };
export { ChoiceList };
