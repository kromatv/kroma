import { Box } from '../src/components/atoms/box';
import { Text } from '../src/components/atoms/text';
import { styles, useStyles } from '../src/core/styles';
import type { ThemeRuntime } from '../src/core/theme';
import { useThemeControls } from '../src/core/use-theme';

const paint = styles({ tile: { bg: 'accent', px: { base: 8, lg: 32 } } });
/** Exercise the shipped compiler's caches with unchanged props across root updates. */
export function CompiledStyleRoot({ expose }: Readonly<{ expose: (root: ThemeRuntime) => void }>) {
  const s = useStyles(paint);
  expose(useThemeControls());
  return (
    <Box testID="declaration" style={s.tile}>
      <Box testID="shorthand" bg="accent" radius="lg">
        <Text testID="type" color="accent">
          Scoped
        </Text>
      </Box>
    </Box>
  );
}
