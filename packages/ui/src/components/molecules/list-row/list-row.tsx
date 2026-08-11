// <ListRow>: one focusable row of a menu or a settings list.
//
// Yoga has no `order` and there is no `:has()` selector, so the Root sorts its
// direct children into the head, middle and tail slots once and publishes what
// it learned through context - the same shape <InputGroup> takes.

import { Children, isValidElement, type ReactNode, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Frost } from '#ui/components/atoms/frost';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { IconWell, type IconWellSize } from '#ui/components/atoms/icon-well';
import { CONTROL, type ControlSize, entryDefaultSize } from '#ui/lib/field-shell';
import { ListGroup, useListGroup } from './list-group';
import { ListRowContext } from './list-row-context';
import { Hint, Label, Leading, Trailing } from './list-row-parts';
import { type ListRowSize, listRowVariants } from './list-row-variants';

// The well has two steps to the shell's three, and a phone's row takes the
// pointer-sized one.
const WELL: Record<ControlSize, IconWellSize> = { sm: 'sm', md: 'sm', tv: 'tv' };

interface Sorted {
  leading: ReactNode[];
  content: ReactNode[];
  trailing: ReactNode[];
}

// An end slot that renders nothing does not claim its slot: a caller writing
// `<ListRow.Leading>{maybe}</ListRow.Leading>` for a value that turned out
// undefined gets the `icon` sugar back, rather than a row with a hole in it.
function filled(child: ReactNode): boolean {
  if (!isValidElement(child)) return false;
  return Children.toArray((child.props as { children?: ReactNode }).children).length > 0;
}

function sort(children: ReactNode): Sorted {
  const at: Sorted = { leading: [], content: [], trailing: [] };
  for (const child of Children.toArray(children)) {
    const part = isValidElement(child) ? child.type : null;
    if (part === Leading) {
      if (filled(child)) at.leading.push(child);
    } else if (part === Trailing) {
      if (filled(child)) at.trailing.push(child);
    } else at.content.push(child);
  }
  return at;
}

function nameOf(content: readonly ReactNode[]): string | undefined {
  for (const child of content) {
    if (!isValidElement(child) || child.type !== Label) continue;
    const text = (child.props as { children?: ReactNode }).children;
    if (typeof text === 'string') return text;
  }
  return undefined;
}

function iconWell(name: IconName | undefined, size: ControlSize): ReactNode {
  if (name === undefined) return null;
  return (
    <Leading>
      <IconWell name={name} size={WELL[size]} />
    </Leading>
  );
}

function labelStack(label: string | undefined, hint: string | undefined): ReactNode {
  return (
    <>
      {label === undefined ? null : <Label>{label}</Label>}
      {hint === undefined ? null : <Hint>{hint}</Hint>}
    </>
  );
}

interface ListRowRootProps extends Omit<FocusableProps, 'children' | 'style' | 'label'> {
  /** Leading glyph, sunk into the kit's icon well. Sugar for a
   *  <ListRow.Leading>; media that is not a glyph goes through the part. */
  icon?: IconName;
  /** The row's accessible name, and its title while the row has no middle
   *  column of its own. A plain-text <ListRow.Label> child names the row too. */
  label?: string;
  /** Sugar for <ListRow.Hint>; dropped, like `label`, once the row is given a
   *  middle column of its own. */
  hint?: string;
  /** The control shell's size, defaulting to the group's, then to the app's
   *  (`setEntryDefaults`). */
  size?: ControlSize;
  /** Whether the row draws the disclosure chevron. Defaults to true for a
   *  pressable row with no <ListRow.Trailing>. Set false for a row that acts in
   *  place: a choice, a toggle, anything that goes nowhere. */
  chevron?: boolean;
  /** The row's parts. Only a DIRECT <ListRow.Leading> or <ListRow.Trailing>
   *  child is sorted into its slot, so those two may be written anywhere;
   *  everything else is the middle column, in the order it was written. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

function Root({
  icon,
  label,
  hint,
  size,
  chevron: wantsChevron,
  children,
  onPress,
  href,
  role,
  selected = false,
  style,
  ...focusProps
}: Readonly<ListRowRootProps>) {
  const group = useListGroup();
  const standalone = group === null;
  const shell = size ?? group?.size ?? entryDefaultSize();
  const metrics = CONTROL[shell];
  const pressable = onPress !== undefined;

  const at = useMemo(() => sort(children), [children]);
  const slots = listRowVariants({ size: shell, standalone, pressable, selected });
  const ctx = useMemo(() => ({ size: shell, metrics, slots }), [shell, metrics, slots]);

  const leading = at.leading.length > 0 ? at.leading : iconWell(icon, shell);
  const middle = at.content.length > 0 ? at.content : labelStack(label, hint);
  const chevron = (wantsChevron ?? pressable) && at.trailing.length === 0;

  return (
    <ListRowContext.Provider value={ctx}>
      <Focusable
        {...focusProps}
        onPress={onPress}
        href={href}
        // A row that does nothing is not a button. Left to the default it would
        // announce as one and then refuse to activate.
        role={role ?? (pressable || href !== undefined ? undefined : 'none')}
        selected={selected}
        label={label ?? nameOf(at.content)}
        focusScale={1.02}
        sv={listRowVariants}
        vars={{ size: shell, pressable, standalone, selected }}
        style={style}
      >
        {(state) => (
          <>
            {/* Blur what shows through the translucent fill: the row reads as
                one glass surface rather than a window on the artwork. A member
                of a group is inside the card that already did this. */}
            {standalone ? <Frost radius={metrics.radius} /> : null}
            {leading}
            {/* minW 0: without it a long label pushes the trailing slot off the
                row instead of ellipsing, which is the one thing a row of a
                settings list must never do. */}
            <Box flex minW={0} gap={2}>
              {middle}
            </Box>
            {at.trailing}
            {chevron ? <Icon name="chevron-right" {...state.slots.chevron} /> : null}
          </>
        )}
      </Focusable>
    </ListRowContext.Provider>
  );
}

const ListRow = { Root, Leading, Label, Hint, Trailing, Group: ListGroup };

export type { ListRowRootProps, ListRowSize };
export { ListRow, listRowVariants };
