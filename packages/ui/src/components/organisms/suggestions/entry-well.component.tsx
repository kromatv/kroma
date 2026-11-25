import type { ReactNode, Ref } from 'react';
import type { View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { useFrostCoat } from '#ui/components/atoms/frost';
import { useStyleScope } from '#ui/core';
import { controlRadius, fieldShell } from '#ui/lib/field-shell';
import type { EntryMetrics } from './entry-metrics';

interface WellLook {
  metrics: EntryMetrics;
  filled: boolean;
  single?: boolean;
  focused: boolean;
  invalid: boolean;
}

interface EntryWellProps extends WellLook {
  wellRef?: Ref<View>;
  onPress?: () => void;
  children: ReactNode;
}

function useWellCoat({ metrics, filled, single = false, focused, invalid }: Readonly<WellLook>) {
  const scope = useStyleScope();
  const { control, inset, gap } = metrics;
  const shell = fieldShell(control, { flat: false, focused, invalid }, scope);
  const frost = useFrostCoat({ borderRadius: controlRadius(control, scope) });
  return {
    pad: { gap, ps: filled ? inset : control.px, pe: single ? control.px : inset, py: inset },
    box: shell.box,
    style: [shell.edge, frost.style],
    layer: frost.layer,
  };
}

/** The well every entry wears, holding the marks and what follows them on as
 *  many lines as they take, or on one when `single`. A side where a mark meets
 *  the edge insets by the well's own inset, a side where text does by the
 *  shell's wider padding: `filled` says a mark starts it, `single` that text
 *  ends it. */
function EntryWell({ wellRef, onPress, children, ...look }: Readonly<EntryWellProps>) {
  const coat = useWellCoat(look);
  return (
    <Box
      ref={wellRef}
      row
      wrap={look.single !== true}
      align="center"
      {...coat.pad}
      {...coat.box}
      onStartShouldSetResponder={() => onPress !== undefined}
      onResponderRelease={onPress}
      style={coat.style}
    >
      {coat.layer}
      {children}
    </Box>
  );
}

export { EntryWell };
