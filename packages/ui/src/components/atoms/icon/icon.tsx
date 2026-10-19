import { useStyleScope } from '#ui/core/style-context';
import { type IconProps, resolveIcon } from '#ui/lib/glyph';
import { DrawnGlyph } from '#ui/lib/icons/drawn-glyph';
import { useIconAssets } from '#ui/lib/icons/library';

export type { IconName, IconProps } from '#ui/lib/glyph';

function Icon(props: Readonly<IconProps>) {
  const scope = useStyleScope();
  const { glyphs } = useIconAssets();
  const { Glyph, size, color, opacity, thickness } = resolveIcon(props, glyphs.glyphFor, scope);
  return (
    <DrawnGlyph Glyph={Glyph} size={size} color={color} opacity={opacity} thickness={thickness} />
  );
}

export { Icon };
