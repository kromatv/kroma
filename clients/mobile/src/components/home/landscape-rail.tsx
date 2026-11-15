import { Box, radius as cornerRadius, styles, Text, useStyles, VirtualRail } from '@kromatv/ui/kit';
import { Pressable, useWindowDimensions } from 'react-native';
import { FadeImage } from '#mobile/components/FadeImage';
import { useGutters } from '#mobile/lib/layout';
import { radius, type } from '#mobile/lib/theme';

const GAP = 12;
const TITLE_GAP = 6;
const TEXT_H = TITLE_GAP + (type.caption.lineHeight ?? 18) + 1 + (type.small.lineHeight ?? 16);

interface LandscapeTile {
  key: string;
  title: string;
  detail?: string | null;
  art: string | null;
  progress?: number;
  onPress: () => void;
}

/** How wide a landscape tile is drawn in a window, which is also the width its
 *  art is asked for. */
export function landscapeWidth(windowWidth: number): number {
  return Math.min(300, windowWidth * 0.55);
}

function LandscapeCard({ tile }: Readonly<{ tile: LandscapeTile }>) {
  const s = useStyles(sDefinition);

  return (
    <Pressable onPress={tile.onPress} style={({ pressed }) => [s.card, pressed && s.cardPressed]}>
      <Box>
        <FadeImage uri={tile.art} seed={tile.key} radius={radius.sm} style={s.art} />
        {tile.progress === undefined ? null : (
          <Box style={s.progressTrack}>
            <Box style={[s.progressFill, { width: `${tile.progress * 100}%` }]} />
          </Box>
        )}
      </Box>
      <Text lines={1} style={s.title}>
        {tile.title}
      </Text>
      {tile.detail ? (
        <Text lines={1} style={s.detail}>
          {tile.detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** A rail of 16:9 tiles. A tile's `progress` is 0..1 and draws the bar over its
 *  art; its `detail` is the quiet line under its title. */
export function LandscapeRail({ tiles }: Readonly<{ tiles: readonly LandscapeTile[] }>) {
  const { width: windowWidth } = useWindowDimensions();
  const gutters = useGutters();
  const width = landscapeWidth(windowWidth);
  return (
    <VirtualRail
      data={tiles}
      itemWidth={width + GAP}
      gap={GAP}
      style={{ height: Math.ceil((width * 9) / 16) + TEXT_H }}
      contentStyle={gutters.style}
      renderItem={(tile) => <LandscapeCard tile={tile} />}
    />
  );
}

const sDefinition = styles({
  card: { w: '100%' },
  cardPressed: { opacity: 0.75 },
  art: { w: '100%', aspectRatio: 16 / 9 },
  title: { ...type.caption, mt: TITLE_GAP, color: 'text' },
  detail: { ...type.small, mt: 1 },
  progressTrack: {
    absolute: true,
    right: 6,
    bottom: 6,
    left: 6,
    h: 3,
    bg: 'text/30',
    radius: cornerRadius.track,
  },
  progressFill: { h: 3, bg: 'accent', radius: cornerRadius.track },
});
