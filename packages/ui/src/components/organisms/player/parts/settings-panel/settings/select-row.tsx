import type { ReactNode } from 'react';
import type { TextStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Text } from '#ui/components/atoms/text';
import { IconOk } from '#ui/components/organisms/player/parts/icons';
import { style, useStyles } from '#ui/core';
import { panel, ROW_FOCUS } from './panel-style';

const MIN_W = style({ minWidth: 0 });
function Line({ node, style }: Readonly<{ node?: ReactNode; style: TextStyle }>) {
  if (node == null) return null;
  if (typeof node !== 'string') return node;
  return <Text style={style}>{node}</Text>;
}

/**
 * One row of a settings sub-list (Quality / Audio / Subtitles / Speed / audio
 * filter): a label, an optional sub-line, an accent check when it is the current
 * value, and an optional trailing control. One control the remote walks like any
 * other; the list it sits in opens on the current value.
 */
export function SelectRow({
  index,
  label,
  sub,
  selected,
  autoFocus = selected,
  onActivate,
  leading,
  trailing,
}: Readonly<{
  index: number;
  label: ReactNode;
  sub?: ReactNode;
  selected?: boolean;
  /** Where the list opens. Default: the selected row. */
  autoFocus?: boolean;
  onActivate: (index: number) => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}>) {
  const panelScoped = useStyles(panel);

  return (
    <Focusable
      // The row's words may arrive as nodes rather than text, and a row named by
      // nothing is one of a list of identical rows.
      label={typeof label === 'string' ? label : undefined}
      selected={Boolean(selected)}
      autoFocus={Boolean(autoFocus)}
      onPress={() => onActivate(index)}
      states={ROW_FOCUS}
      style={panelScoped.selectRow}
    >
      {leading}
      <Box flex style={MIN_W}>
        <Line node={label} style={panelScoped.selectLabel} />
        <Line node={sub} style={panelScoped.selectSub} />
      </Box>
      {trailing}
      {selected ? <IconOk size={24} color="accentText" /> : null}
    </Focusable>
  );
}
