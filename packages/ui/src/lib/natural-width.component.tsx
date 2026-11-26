import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';

interface NaturalWidthProps {
  style?: StyleProp<ViewStyle>;
  onWidth: (width: number) => void;
  children: ReactNode;
}

const sDefinition = styles({
  anchor: { absolute: true, top: 0, start: 0, w: 0, h: 0, row: true, opacity: 0 },
  line: { absolute: true, top: 0, start: 0, row: true, align: 'center' },
});

/** Lays its children out again on one line, unconstrained, invisible and out of
 *  the accessibility tree, and reports the width that line takes: what a box
 *  needs to show them without clipping. A one-line text inside must say
 *  `lines={1}`, or the browser wraps it at every word. */
export function NaturalWidth({ style, onWidth, children }: Readonly<NaturalWidthProps>) {
  const s = useStyles(sDefinition);
  return (
    <Box style={s.anchor} pointerEvents="none" aria-hidden>
      <Box style={[s.line, style]} onLayout={(event) => onWidth(event.nativeEvent.layout.width)}>
        {children}
      </Box>
    </Box>
  );
}
