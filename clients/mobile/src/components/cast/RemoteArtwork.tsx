import { type MediaItem, sizedImageUrl } from '@kroma/core';
import { Box, Icon, styles, Text } from '@kroma/ui/kit';
import { Image } from 'expo-image';
import { useWindowDimensions } from 'react-native';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';

export function RemoteArtwork({ item }: Readonly<{ item?: MediaItem }>) {
  const client = useClient();
  const { width } = useWindowDimensions();
  const art = item
    ? sizedImageUrl(client.backdropFor(item) ?? client.posterFor(item), width)
    : null;
  return (
    <>
      {art ? (
        <Image source={{ uri: art }} style={s.art} contentFit="cover" transition={200} />
      ) : (
        <Box style={[s.art, s.artFallback]}>
          <Icon name="device-tv" size={40} thickness={1.4} color="textDim" />
        </Box>
      )}
      <Text lines={2} style={s.title}>
        {item?.metadata?.title ?? item?.title ?? ''}
      </Text>
      {item?.showTitle ? (
        <Text lines={1} style={s.subtitle}>
          {item.showTitle}
        </Text>
      ) : null}
    </>
  );
}

const s = styles({
  art: { w: '100%', aspect: 16 / 9, bg: 'surface1', radius: radius.md },
  artFallback: { center: true },
  title: { ...type.title, color: 'text' },
  subtitle: { ...type.caption, mt: -spacing.sm, color: 'textMuted' },
});
