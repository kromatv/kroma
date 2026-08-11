// One action, in both presentations: a row of the D-pad dialog, and a row of
// the pointer's anchored panel. Which one it renders is the surface's
// decision, handed down through the row context.

import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { styles, sv } from '#ui/core';
import { CONTROL } from '#ui/lib/field-shell';
import { useMenuRow } from './menu-context';

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

function Item(props: Readonly<MenuItemProps>) {
  const { children, icon, disabled = false, tone = 'default' } = props;
  const row = useMenuRow('Item');
  const danger = tone === 'danger';
  const label = labelOf(props);
  const composed = children !== undefined && textOf(children) === undefined;

  if (row.presentation === 'panel') {
    const slots = menuItemVariants({ danger });
    return (
      <Pressable
        nativeID={row.nativeID}
        role="menuitem"
        accessibilityLabel={label}
        // The panel is a web-only presentation, and react-native-web reads the
        // flat aria props rather than the state object.
        aria-disabled={disabled}
        tabIndex={-1}
        onPress={row.fire}
        onHoverIn={row.onHoverIn}
        style={[
          slots.root,
          s.row,
          row.active && danger ? s.activeDanger : null,
          row.active && !danger ? s.active : null,
          disabled ? s.disabled : null,
        ]}
      >
        {composed ? (
          children
        ) : (
          <>
            {icon ? <Icon name={icon} size={15} color={danger ? 'danger' : 'text/80'} /> : null}
            <Text variant="body" style={[slots.ink, s.label]}>
              {label}
            </Text>
          </>
        )}
      </Pressable>
    );
  }

  return (
    <Focusable
      role="menuitem"
      label={label}
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
            {icon ? <Icon name={icon} size={16} color={danger ? 'danger' : 'text/80'} /> : null}
            <Text variant="body" style={focus.slots.ink}>
              {label}
            </Text>
            <Box flex />
          </>
        )
      }
    </Focusable>
  );
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
  activeDanger: { bg: 'danger/14' },
  disabled: { opacity: 0.4 },
  label: { fontSize: 13, fontWeight: '600' },
});

export type { MenuItemProps, MenuTone };
export { Item, labelOf, menuItemVariants, Separator };
