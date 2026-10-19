import { StyleSheet, type ViewStyle } from 'react-native';
import { activeTheme, onPaper, resolveStyles, sharedStyle, styles } from '#ui/core';
import { BARE, type FrostCoat, type FrostInput } from './frost-types';

const sDefinition = styles({
  fill: { fill: true, pointerEvents: 'none', z: -1 },
  clip: { overflow: 'hidden' },
});

/** The coat a glass surface wears on native: the shell's registered blur view,
 *  clipped to the surface's corner, or nothing when no shell registered one. */
export function frostCoat({
  surface,
  options,
  platform: PlatformFrost,
  scope,
}: FrostInput): FrostCoat {
  const { on = true, amount = 12, tint } = options;
  if (!on || !PlatformFrost) return BARE;
  const corner = (StyleSheet.flatten(surface) as ViewStyle | undefined)?.borderRadius;
  const s = resolveStyles(sDefinition, scope);
  return {
    style: null,
    layer: (
      <PlatformFrost
        intensity={Math.min(100, amount * 4)}
        tint={tint ?? (onPaper(activeTheme(scope.theme)) ? 'light' : 'dark')}
        style={[
          s.fill,
          s.clip,
          typeof corner === 'number'
            ? sharedStyle(`frost:corner:${corner}`, { radius: corner }, scope)
            : null,
        ]}
      />
    ),
  };
}
