import { useStyleScope } from '#ui/core/style-context';
import { useDirection } from '#ui/lib/direction';
import { type IconProps, resolveIcon } from '#ui/lib/glyph';
import { DrawnGlyph } from '#ui/lib/icons/drawn-glyph.component';
import { useIconAssets } from '#ui/lib/icons/library';
import { mirrorsInRtl } from '#ui/lib/icons/mirrored';

export type { IconName, IconProps } from '#ui/lib/glyph';

function Icon(props: Readonly<IconProps>) {
  const scope = useStyleScope();
  const { glyphs } = useIconAssets();
  const mirror = useDirection() === 'rtl' && mirrorsInRtl(props.name);
  const { Glyph, size, color, opacity, thickness } = resolveIcon(props, glyphs.glyphFor, scope);
  return (
    <DrawnGlyph
      Glyph={Glyph}
      size={size}
      color={color}
      opacity={opacity}
      thickness={thickness}
      mirror={mirror}
    />
  );
}

export { Icon };
