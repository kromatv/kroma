import { Box, hasGlyph, Icon, styles, useStyles } from '@kromatv/ui/kit';
import { Image } from 'react-native';
import { imageUrl } from '#web/shared/lib/api';

const sDefinition = styles({ picture: { width: '72%', height: '72%' } });

/** A sign-in provider's mark: its picture on a white tile, so a logo of any
 * colour reads on any theme, or its icon when it has no picture. */
export function ProviderMark({
  icon,
  image,
  size = 22,
}: Readonly<{ icon: string; image?: string | null; size?: number }>) {
  const s = useStyles(sDefinition);
  const picture = imageUrl(image);
  if (!picture) {
    return <Icon name={hasGlyph(icon) ? icon : 'key'} size={Math.round(size * 0.82)} />;
  }
  return (
    <Box center w={size} h={size} shrink={0} radius="xs" bg="white">
      <Image
        source={{ uri: picture }}
        style={s.picture}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </Box>
  );
}
