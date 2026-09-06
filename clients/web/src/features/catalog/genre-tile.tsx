import {
  type GenreCount,
  genreColors,
  genreLabel,
  genreSegment,
  genreTint,
  sizedImageUrl,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Focusable,
  genreIcon,
  Icon,
  Img,
  motion,
  type StyleDecl,
  sharedStyle,
  styles,
  svFor,
  Text,
} from '@kroma/ui/kit';
import { View, type ViewStyle } from 'react-native';

import { wash } from '#web/shared/lib/art-styles';
import { RouteLink } from '#web/shared/ui/route-link';

const genreTile = svFor<{ root: StyleDecl; art: StyleDecl }>()({
  slots: {
    root: {
      overflow: 'hidden',
      aspect: 3 / 2,
      radius: 'xl',
      borderWidth: 1,
      border: 'tint/6',
      _hover: { border: 'accent/50' },
    },
    art: { fill: true },
  },
});

const ZOOM = 1.05;

// A CSS transition, not Animated: react-native-web has no native driver, so an
// Animated value here is a rAF loop competing with React for the main thread.
const ZOOM_TRANSITION = {
  transitionProperty: 'transform',
  transitionDuration: `${motion.duration.slow}ms`,
  transitionTimingFunction: `cubic-bezier(${motion.bezier.out.join(', ')})`,
} as const;

const tint = (slug: string) => sharedStyle(`tint:${slug}`, { backgroundImage: genreTint(slug) });

const art = styles({
  still: { ...ZOOM_TRANSITION, transform: [{ scale: 1 }] },
  zoomed: { ...ZOOM_TRANSITION, transform: [{ scale: ZOOM }] },
});

export interface GenreTileProps {
  genre: GenreCount;
  count: string;
  backdrop: string | null;
}

export function GenreTile({ genre, count, backdrop }: Readonly<GenreTileProps>) {
  const t = useT();
  const [from, to] = genreColors(genre.slug);
  const icon = genreIcon(genre.slug);
  const label = genreLabel(t, genre.name);
  return (
    <Focusable sv={genreTile} label={label} style={wash(from, to, 150)} asChild>
      {({ hovered, slots }) => (
        <RouteLink to="/genres/$id" params={{ id: genreSegment(genre.slug) }}>
          <Art src={backdrop} hovered={hovered} style={slots.art} />
          <Box fill pointerEvents="none" style={tint(genre.slug)} />
          <Box
            absolute
            left={{ base: 16, md: 20 }}
            right={{ base: 16, md: 20 }}
            bottom={{ base: 14, md: 16 }}
          >
            <Box row align="center" gap={8}>
              {icon ? <Icon name={icon} size={18} color="white" /> : null}
              <Text variant="cardTitle" color="white">
                {label}
              </Text>
            </Box>
            <Text variant="meta" color="white/70" mt={2}>
              {count}
            </Text>
          </Box>
        </RouteLink>
      )}
    </Focusable>
  );
}

function Art({
  src,
  hovered,
  style,
}: Readonly<{ src: string | null; hovered: boolean; style: ViewStyle }>) {
  return (
    <View style={[style, hovered ? art.zoomed : art.still]}>
      <Img src={src ? sizedImageUrl(src, 420) : null} fit="cover" position="50% 25%" fill />
    </View>
  );
}
