import type { ReactNode } from 'react';
import { Pressable, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';
import { SwitchFace } from '#ui/components/atoms/switch';
import { Text } from '#ui/components/atoms/text';
import { VIRTUAL_FOCUS } from '#ui/components/organisms/player/lib/virtual-focus';
import { styles } from '#ui/core';
import { a11yState } from '#ui/lib/a11y';
import { panel, rowStyle } from './panel-style';

/**
 * A settings main-menu row: leading icon + label (+ current value), then a
 * chevron (navigates into a sub-view) or an on/off switch (Loop, Statistics).
 * The whole row is the focusable control; a pointer moves D-pad focus, OK/click
 * activates (§15).
 *
 * A bare Pressable rather than a <Focusable>: inside the player the focused row
 * is chosen by the panel's own list navigation (usePlayerNav), not by the screen
 * focus engine, so the row must render the `focused` prop it is given rather
 * than track focus itself.
 */
export function MenuRow({
  icon,
  label,
  value,
  toggle,
  on,
  focused,
  style,
  onActivate,
  onFocus,
}: Readonly<{
  icon: ReactNode;
  label: string;
  value?: ReactNode;
  toggle?: boolean;
  on?: boolean;
  focused: boolean;
  /** Placement only (the menu uses it to open a gap between two groups of
   *  rows). The row's own look stays here. */
  style?: ViewStyle;
  onActivate: () => void;
  onFocus: () => void;
}>) {
  return (
    <Pressable
      {...VIRTUAL_FOCUS}
      onPress={onActivate}
      onPointerEnter={onFocus}
      accessibilityRole={toggle ? 'switch' : 'button'}
      accessibilityLabel={label}
      {...(toggle ? a11yState({ checked: Boolean(on) }) : null)}
      style={[...rowStyle(panel.menuRow, panel.rowOn, focused), style]}
    >
      {icon}
      <Box flex style={{ minWidth: 0 }}>
        <Text style={panel.menuLabel}>{label}</Text>
        {!toggle && value != null ? <Text style={panel.menuValue}>{value}</Text> : null}
      </Box>
      {/* The KIT's switch face, not a lookalike: the row is the control (see the
          header), so it renders the atom's visuals without its `Focusable`.
          `size="tv"`: this panel is read from a sofa. */}
      {toggle ? (
        <SwitchFace checked={Boolean(on)} size="tv" style={s.noShrink} />
      ) : (
        <Icon name="chevron-right" size={23} thickness={2.2} />
      )}
    </Pressable>
  );
}

const s = styles({
  noShrink: { shrink: 0 },
});
