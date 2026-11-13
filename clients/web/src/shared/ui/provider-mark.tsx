import { Box, hasGlyph, Icon, styles, useStyles } from '@kromatv/ui/kit';
import { Image } from 'react-native';
import { imageUrl } from '#web/shared/lib/api';

const sDefinition = styles({
  tiled: { width: '72%', height: '72%' },
  whole: { width: '100%', height: '100%' },
});

/** A sign-in provider's mark: its logo on a white tile, so a logo of any
 * colour reads on any theme, or its icon when it has no logo. `plain` drops
 * the tile, for a logo already drawn for the surface it sits on. */
export function ProviderMark({
  icon,
  image,
  size = 22,
  plain = false,
}: Readonly<{ icon: string; image?: string | null; size?: number; plain?: boolean }>) {
  const s = useStyles(sDefinition);
  const picture = imageUrl(image);
  if (!picture) {
    return <Icon name={hasGlyph(icon) ? icon : 'key'} size={Math.round(size * 0.82)} />;
  }
  return (
    <Box center w={size} h={size} shrink={0} radius="xs" bg={plain ? undefined : 'white'}>
      <Image
        source={{ uri: picture }}
        style={plain ? s.whole : s.tiled}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </Box>
  );
}
