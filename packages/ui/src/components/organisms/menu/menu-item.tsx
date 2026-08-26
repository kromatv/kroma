// One action, in both presentations: a row of the D-pad dialog, and a row of
// the pointer's anchored panel. Which one it renders is the surface's
// decision, handed down through the row context.

import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type TextStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { styles, sv } from '#ui/core';
import { CONTROL } from '#ui/lib/field-shell';
import { type MenuRowState, useMenuRow } from './menu-context';

const menuItemVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 10,
      px: 12,
      py: 9,
      radius: 'md',
      _hover: { bg: 'tint/7' },
    },
    ink: { color: 'text/80' },
  },
  variants: {
    danger: {
      true: { root: { _hover: { bg: 'danger/14' } }, ink: { color: 'danger' } },
    },
  },
  defaults: { danger: false },
});

type MenuTone = 'default' | 'danger';

interface MenuItemProps {
  /** The row. A plain string child IS the label; anything else is the row
   *  itself, and then `label` is what assistive tech and the type-ahead read. */
  children?: ReactNode;
  label?: string;
  icon?: IconName;
  onSelect: () => void;
  disabled?: boolean;
  /** `danger` is the destructive tail of the list: red ink, red wash. */
  tone?: MenuTone;
}

function textOf(children: ReactNode): string | undefined {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  return undefined;
}

function labelOf(props: Readonly<MenuItemProps>): string {
  return props.label ?? textOf(props.children) ?? '';
}

interface RowFaceProps {
  icon: IconName | undefined;
  label: string;
  danger: boolean;
  iconSize: number;
  ink: StyleProp<TextStyle>;
}

function RowFace({ icon, label, danger, iconSize, ink }: Readonly<RowFaceProps>) {
  const glyph = danger ? 'danger' : 'text/80';
  return (
    <>
      {icon ? <Icon name={icon} size={iconSize} color={glyph} /> : null}
      <Text variant="body" style={ink}>
        {label}
      </Text>
    </>
  );
}

interface RowProps {
  row: MenuRowState;
  label: string;
  icon: IconName | undefined;
  disabled: boolean;
  danger: boolean;
  composed: boolean;
  children: ReactNode;
}

function PanelRow({ row, label, icon, disabled, danger, composed, children }: Readonly<RowProps>) {
  const slots = menuItemVariants({ danger });
  const wash = danger ? s.activeDanger : s.active;
  return (
    <Pressable
      nativeID={row.nativeID}
      role="menuitem"
      // A composed row has no label of its own, and an EMPTY name is worse than
      // none: it hides the words the row does draw.
      accessibilityLabel={label || undefined}
      aria-disabled={disabled}
      tabIndex={-1}
      onPress={row.fire}
      onHoverIn={row.onHoverIn}
      style={[
        slots.root,
        s.row,
        row.active ? wash : null,
        row.active && row.keyed ? s.keyed : null,
        disabled ? s.disabled : null,
      ]}
    >
      {composed ? (
        children
      ) : (
        <RowFace
          icon={icon}
          label={label}
          danger={danger}
          iconSize={15}
          ink={[slots.ink, s.label]}
        />
      )}
    </Pressable>
  );
}

function DialogRow({ row, label, icon, disabled, danger, composed, children }: Readonly<RowProps>) {
  return (
    <Focusable
      role="menuitem"
      label={label || undefined}
      disabled={disabled}
      onPress={row.fire}
      sv={menuItemVariants}
      vars={{ danger }}
    >
      {(focus) =>
        composed ? (
          children
        ) : (
          <>
            <RowFace
              icon={icon}
              label={label}
              danger={danger}
              iconSize={16}
              ink={focus.slots.ink}
            />
            <Box flex />
          </>
        )
      }
    </Focusable>
  );
}

function Item(props: Readonly<MenuItemProps>) {
  const { children, icon, disabled = false, tone = 'default' } = props;
  const row = useMenuRow('Item');
  const shared = {
    row,
    label: labelOf(props),
    icon,
    disabled,
    danger: tone === 'danger',
    composed: children !== undefined && textOf(children) === undefined,
  };

  if (row.presentation === 'panel') return <PanelRow {...shared}>{children}</PanelRow>;
  return <DialogRow {...shared}>{children}</DialogRow>;
}

/** A rule between two groups of actions. */
function Separator() {
  return (
    <Box role="separator">
      <Divider spacing={6} />
    </Box>
  );
}

const s = styles({
  row: { radius: CONTROL.sm.radius },
  active: { bg: 'tint/7' },
  // On the edge: the rows abut, so a gap either way lands on something.
  keyed: { ring: 'focusEdge' },
  activeDanger: { bg: 'danger/14' },
  disabled: { opacity: 0.4 },
  label: { fontSize: 13, fontWeight: '600' },
});

export type { MenuItemProps, MenuTone };
export { Item, labelOf, menuItemVariants, Separator };
