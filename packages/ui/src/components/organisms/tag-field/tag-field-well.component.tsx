import type { ReactNode, Ref } from 'react';
import type { View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { useFrostCoat } from '#ui/components/atoms/frost';
import { useStyleScope } from '#ui/core';
import { controlRadius, fieldShell } from '#ui/lib/field-shell';
import type { TagMetrics } from './tag-field-metrics';

interface WellLook {
  metrics: TagMetrics;
  filled: boolean;
  focused: boolean;
  invalid: boolean;
}

interface TagFieldWellProps extends WellLook {
  wellRef?: Ref<View>;
  onPress?: () => void;
  children: ReactNode;
}

function useWellCoat({ metrics, filled, focused, invalid }: Readonly<WellLook>) {
  const scope = useStyleScope();
  const { control, inset, gap } = metrics;
  const shell = fieldShell(control, { flat: false, focused, invalid }, scope);
  const frost = useFrostCoat({ borderRadius: controlRadius(control, scope) });
  return {
    pad: { gap, ps: filled ? inset : control.px, pe: inset, py: inset },
    box: shell.box,
    style: [shell.edge, frost.style],
    layer: frost.layer,
  };
}

/** The field's well: the one every entry wears, holding the tags and what
 *  follows them on as many lines as they take. A side where a tag meets the
 *  edge insets by the well's own inset, a side where text does by the shell's
 *  wider padding. */
function TagFieldWell({ wellRef, onPress, children, ...look }: Readonly<TagFieldWellProps>) {
  const coat = useWellCoat(look);
  return (
    <Box
      ref={wellRef}
      row
      wrap
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

export { TagFieldWell };
