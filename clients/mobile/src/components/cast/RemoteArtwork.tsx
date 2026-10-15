import type { KromaClient } from '@kromatv/client';
import { type CastShowing, castShownTitle, sizedImageUrl } from '@kromatv/core';
import { Box, Icon, styles, Text } from '@kromatv/ui/kit';
import { Image } from 'expo-image';
import { useWindowDimensions } from 'react-native';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';

function artOf(showing: CastShowing, client: KromaClient): string | null {
  if (!('item' in showing)) return client.media.artwork.resolve(showing.watch.poster);
  const { item } = showing;
  return client.media.artwork.backdropFor(item) ?? client.media.artwork.posterFor(item);
}

export function RemoteArtwork({ showing }: Readonly<{ showing: CastShowing | null }>) {
  const client = useClient();
  const { width } = useWindowDimensions();
  const art = showing ? sizedImageUrl(artOf(showing, client), width) : null;
  const showTitle = showing && 'item' in showing ? showing.item.showTitle : null;
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
        {showing ? castShownTitle(showing) : ''}
      </Text>
      {showTitle ? (
        <Text lines={1} style={s.subtitle}>
          {showTitle}
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
