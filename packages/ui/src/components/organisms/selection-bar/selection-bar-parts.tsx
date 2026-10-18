import type { ReactNode } from 'react';
import { Button, type ButtonVariant } from '#ui/components/atoms/button';
import { Focusable } from '#ui/components/atoms/focusable';
import type { IconName } from '#ui/components/atoms/icon';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Text } from '#ui/components/atoms/text';
import { Tooltip } from '#ui/components/molecules/tooltip';
import { type StyleDecl, svFor, type TypeRole } from '#ui/core';
import { bySize, type ControlSize } from '#ui/lib/field-shell';
import { useSelectionBar } from './selection-bar-context';

type SelectionBarTone = 'default' | 'accent' | 'danger';

const VARIANT = {
  default: 'ghost',
  accent: 'primary',
  danger: 'dangerGhost',
} as const satisfies Record<SelectionBarTone, ButtonVariant>;

/** How many are selected, in the caller's words. Its text is what a screen
 *  reader hears each time the count moves, so it takes the finished sentence
 *  rather than a number and a noun written side by side. */
function Status({ children }: Readonly<{ children: ReactNode }>) {
  const { size } = useSelectionBar('Status');
  return (
    <Text variant={INK[size]} lines={1}>
      {children}
    </Text>
  );
}

interface SelectionBarSelectAllProps {
  /** The drawn words and the accessible name: say the number it reaches. */
  label: string;
  onPress: () => void;
}

/** Widens a selection made on one page, or among the rows a filter left, to
 *  every row the set holds. Render it while part of the set is selected and
 *  leave it out once all of it is: only the caller knows which rows the set
 *  holds. */
function SelectAll({ label, onPress }: Readonly<SelectionBarSelectAllProps>) {
  const { size } = useSelectionBar('SelectAll');
  return (
    <Focusable label={label} onPress={onPress} sv={selectAllVariants} vars={{ size }}>
      <Text variant={INK[size]} color="accentText" lines={1}>
        {label}
      </Text>
    </Focusable>
  );
}

/** Empties the selection, which is also what takes the bar away. It draws a
 *  glyph alone, so `label` is its name and its tooltip. */
function Clear({ label }: Readonly<{ label: string }>) {
  const { size, onClear } = useSelectionBar('Clear');
  return (
    <Tooltip label={label}>
      <IconButton icon="x" label={label} control={size} variant="ghost" onPress={onClear} />
    </Tooltip>
  );
}

interface SelectionBarItemProps {
  /** Also the menu row's words once the item has moved into the overflow menu. */
  label: string;
  icon?: IconName;
  /** `accent` for the one action the rows were picked for, `danger` for the destructive one. */
  tone?: SelectionBarTone;
  onPress: () => void;
  disabled?: boolean;
  /** A spinner in the glyph's place; in the overflow menu the row is disabled instead. */
  loading?: boolean;
}

/** One action on the selection, drawn as a button on the bar's control row. */
function Item({
  label,
  icon,
  tone = 'default',
  onPress,
  disabled,
  loading,
}: Readonly<SelectionBarItemProps>) {
  const { size } = useSelectionBar('Item');
  return (
    <Button
      size={size}
      variant={VARIANT[tone]}
      icon={icon}
      label={label}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
    />
  );
}

const INK: Record<ControlSize, TypeRole> = { sm: 'label', md: 'label', tv: 'labelTv' };

const selectAllVariants = svFor<{ root: StyleDecl }>()({
  slots: {
    root: { row: true, align: 'center', _hover: { bg: 'tint/8' }, _press: { bg: 'tint/14' } },
  },
  variants: {
    size: bySize((m) => ({ root: { minH: m.height, px: m.gap, radius: m.radius } })),
  },
  defaults: { size: 'sm' },
});

export type { SelectionBarItemProps, SelectionBarSelectAllProps, SelectionBarTone };
export { Clear, Item, SelectAll, Status };
