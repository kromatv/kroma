import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { SwitchFace } from '#ui/components/atoms/switch';
import { Text } from '#ui/components/atoms/text';
import { style, styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { panel, ROW_FOCUS } from './panel-style';

/**
 * A settings main-menu row: leading icon + label (+ current value), then a
 * chevron (navigates into a sub-view) or an on/off switch (Loop, Statistics).
 * The whole row is one control the remote walks like any other; OK or a click
 * activates it (§15).
 */

const MIN_W = style({ minWidth: 0 });
export function MenuRow({
  icon,
  label,
  value,
  toggle,
  on,
  autoFocus,
  style,
  onActivate,
}: Readonly<{
  icon: ReactNode;
  label: string;
  value?: ReactNode;
  toggle?: boolean;
  on?: boolean;
  autoFocus?: boolean;
  /** Placement only (the menu uses it to open a gap between two groups of
   *  rows). The row's own look stays here. */
  style?: ViewStyle;
  onActivate: () => void;
}>) {
  const panelScoped = useStyles(panel);

  const s = useStyles(sDefinition);

  return (
    <Focusable
      role={toggle ? 'switch' : 'button'}
      label={label}
      checked={toggle ? Boolean(on) : undefined}
      autoFocus={autoFocus}
      onPress={onActivate}
      states={ROW_FOCUS}
      style={[panelScoped.menuRow, style]}
    >
      {icon}
      <Box flex style={MIN_W}>
        <Text style={panelScoped.menuLabel}>{label}</Text>
        {!toggle && value != null ? <Text style={panelScoped.menuValue}>{value}</Text> : null}
      </Box>
      {/* The KIT's switch face, not a lookalike: the row is the control, so it
          renders the atom's visuals without its `Focusable`. `size="tv"`: this
          panel is read from a sofa. */}
      {toggle ? (
        <SwitchFace checked={Boolean(on)} size="tv" style={s.noShrink} />
      ) : (
        <Icon name="chevron-right" size={23} thickness={2.2} />
      )}
    </Focusable>
  );
}

const sDefinition = styles({
  noShrink: { shrink: 0 },
});
