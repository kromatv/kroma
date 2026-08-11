import type { CastMember } from '@kroma/core';
import { posterColors, sizedImageUrl } from '@kroma/core';
import { BackButton, Box, PersonCard, styles, Text, tintGradient } from '@kroma/ui/kit';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { goBack } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { shades, spacing, type } from '#mobile/lib/theme';
import { FadeImage } from './FadeImage';

export { DetailActions } from './DetailActions';

export function MetaBadge({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box style={s.badge}>
      <Text style={s.badgeText}>{children}</Text>
    </Box>
  );
}

/** Backdrop hero shading into the page. Given `scrollY`, the artwork stretches
 * elastically on pull-down. */
export function DetailHero({
  art,
  seed,
  title,
  context,
  meta,
  scrollY,
}: Readonly<{
  art: string | null;
  seed: string;
  title: string;
  context?: string;
  meta?: ReactNode;
  scrollY?: SharedValue<number>;
}>) {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gutters = useGutters();
  const { width, height: windowH } = useWindowDimensions();
  // Capped against the window height too: on a landscape phone a width-driven
  // hero would fill the whole viewport.
  const height = Math.min(width * 0.62, 460, Math.round(windowH * 0.72));

  const stretch = useAnimatedStyle(() => {
    // Only overscroll (y < 0) stretches.
    const y = Math.min(scrollY?.value ?? 0, 0);
    return {
      transform: [{ translateY: y / 2 }, { scale: 1 - y / height }],
    };
  });
  const ground = shades();

  return (
    <Box style={{ height }}>
      <Animated.View style={[StyleSheet.absoluteFill, stretch]}>
        <FadeImage uri={art} seed={seed} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={[ground.mid, ground.transparent, ground.transparent, ground.mid, ground.full]}
          locations={[0, 0.2, 0.45, 0.75, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Box style={[s.back, { top: insets.top + 6, left: gutters.left }]}>
        <BackButton
          size={40}
          hitSlop={12}
          label={t('common.back')}
          onPress={() => goBack(router)}
        />
      </Box>
      <Box style={[s.heroText, { left: gutters.left, right: gutters.right }]}>
        {context ? <Text style={s.context}>{context}</Text> : null}
        <Text lines={2} style={s.heroTitle}>
          {title}
        </Text>
        {meta ? <Box style={s.metaRow}>{meta}</Box> : null}
      </Box>
    </Box>
  );
}

/** Circular cast photos; tapping a member opens their credits page. */
export function CastRail({ cast }: Readonly<{ cast: CastMember[] }>) {
  const client = useClient();
  const router = useRouter();
  const gutters = useGutters();
  if (cast.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[s.castRail, gutters.style]}
    >
      {cast.slice(0, 15).map((member) => (
        <PersonCard
          key={member.name}
          size="sm"
          name={member.name}
          role={member.character}
          photo={sizedImageUrl(client.resolveArt(member.profileUrl), 320)}
          gradient={tintGradient(posterColors(member.name))}
          onPress={() => router.push(`/person/${encodeURIComponent(member.name)}` as never)}
        />
      ))}
    </ScrollView>
  );
}

const s = styles({
  back: { absolute: true, z: 2 },
  heroText: { absolute: true, bottom: spacing.sm, gap: 6 },
  context: { ...type.caption, color: 'accentText', fontWeight: '700' },
  heroTitle: {
    ...type.display,
    fontSize: 32,
    textShadowColor: 'bg/85',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  metaRow: { row: true, wrap: true, align: 'center', gap: 8 },
  badge: { px: 8, py: 3, bg: 'surface2/85', radius: 7 },
  badgeText: { fontSize: 12, fontWeight: '600', color: 'text' },
  castRail: { gap: 12 },
});
