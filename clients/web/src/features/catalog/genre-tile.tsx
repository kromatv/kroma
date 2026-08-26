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
  gradient,
  Icon,
  Img,
  motion,
  type StyleDecl,
  svFor,
  Text,
} from '@kroma/ui/kit';
import { useEffect, useState } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';

import { RouteLink } from '#web/shared/ui/route-link';

const genreTile = svFor<{ root: StyleDecl; art: StyleDecl }>()({
  slots: {
    root: {
      overflow: 'hidden',
      aspect: 3 / 2,
      radius: '2xl',
      borderWidth: 1,
      border: 'tint/6',
      _hover: { border: 'accent/50' },
    },
    art: { fill: true },
  },
});

const ZOOM = 1.05;

const EASE = Easing.bezier(...motion.bezier.out);

function useZoom(hovered: boolean): Animated.Value {
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const anim = Animated.timing(scale, {
      toValue: hovered ? ZOOM : 1,
      duration: motion.duration.slow,
      easing: EASE,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [hovered, scale]);
  return scale;
}

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
    <Focusable
      sv={genreTile}
      label={label}
      style={gradient(`linear-gradient(150deg, ${from}, ${to})`)}
      as={<RouteLink to="/genres/$id" params={{ id: genreSegment(genre.slug) }} />}
    >
      {({ hovered, slots }) => (
        <>
          <Art src={backdrop} hovered={hovered} style={slots.art} />
          <Box fill pointerEvents="none" style={gradient(genreTint(genre.slug))} />
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
        </>
      )}
    </Focusable>
  );
}

function Art({
  src,
  hovered,
  style,
}: Readonly<{ src: string | null; hovered: boolean; style: ViewStyle }>) {
  const scale = useZoom(hovered);
  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <Img src={src ? sizedImageUrl(src, 420) : null} fit="cover" position="50% 25%" fill />
    </Animated.View>
  );
}
