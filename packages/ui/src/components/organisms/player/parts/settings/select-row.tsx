import type { ReactNode } from 'react';
import { Pressable, type TextStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { VIRTUAL_FOCUS } from '#ui/components/organisms/player/lib/virtual-focus';
import { IconOk } from '#ui/components/organisms/player/parts/icons';
import { rowOn, rowStyle, selectLabel, selectRow, selectSub } from './panelStyle';

function Line({ node, style }: Readonly<{ node?: ReactNode; style: TextStyle }>) {
  if (node == null) return null;
  if (typeof node !== 'string') return node;
  return <Txt style={style}>{node}</Txt>;
}

/**
 * One row of a settings sub-list (Quality / Audio / Subtitles / Speed / audio
 * filter): a label, an optional sub-line, an accent check when it is the current
 * value, and an optional trailing control.
 *
 * Focus is the `focused` PROP, not CSS state: the panel's list navigation owns
 * which row is current, and a pointer entering a row moves that selection
 * exactly as the D-pad would (§15).
 */
export function SelectRow({
  label,
  sub,
  selected,
  focused,
  onActivate,
  onFocus,
  leading,
  trailing,
}: Readonly<{
  label: ReactNode;
  sub?: ReactNode;
  selected?: boolean;
  focused: boolean;
  onActivate: () => void;
  onFocus: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}>) {
  return (
    <Pressable
      {...VIRTUAL_FOCUS}
      onPress={onActivate}
      onPointerEnter={onFocus}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      style={rowStyle(selectRow, rowOn, focused)}
    >
      {leading}
      <Box flex style={{ minWidth: 0 }}>
        <Line node={label} style={selectLabel} />
        <Line node={sub} style={selectSub} />
      </Box>
      {trailing}
      {selected ? <IconOk size={24} color="accent" /> : null}
    </Pressable>
  );
}
