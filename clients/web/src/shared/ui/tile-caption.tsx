import type { MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Icon, Row, Text } from '@kroma/ui/kit';

const KIND_KEY: Record<'movie' | 'show', MessageKey> = {
  movie: 'discover.kindMovie',
  show: 'discover.kindShow',
};

export interface TileCaptionProps {
  title: string;
  kind: 'movie' | 'show';
  year: number | null;
  rating: number | null;
}

export function TileCaption({ title, kind, year, rating }: Readonly<TileCaptionProps>) {
  const t = useT();
  return (
    <Box mt={8} px={2}>
      <Text variant="label" lines={1}>
        {title}
      </Text>
      <Row gap={6} mt={2} align="center">
        {rating === null ? null : (
          <>
            <Row gap={3} align="center">
              <Icon name="star-filled" size={10} color="accent" />
              <Text variant="meta" color="accent">
                {rating.toFixed(1)}
              </Text>
            </Row>
            <Text variant="meta" color="white/20">
              ·
            </Text>
          </>
        )}
        <Text variant="meta" color="textDim">
          {t(KIND_KEY[kind])}
        </Text>
        {year === null ? null : (
          <>
            <Text variant="meta" color="white/20">
              ·
            </Text>
            <Text variant="meta" color="textDim">
              {year}
            </Text>
          </>
        )}
      </Row>
    </Box>
  );
}
