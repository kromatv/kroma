import type { CastMember } from '@kroma/core';
import { posterColors, sizedImageUrl } from '@kroma/core';
import { BackButton, PersonCard, tintGradient } from '@kroma/ui/kit';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { goBack } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { colors, SHADE, spacing, type } from '#mobile/lib/theme';
import { FadeImage } from './FadeImage';

export { DetailActions } from './DetailActions';

export function MetaBadge({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{children}</Text>
    </View>
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

  return (
    <View style={{ height }}>
      <Animated.View style={[StyleSheet.absoluteFill, stretch]}>
        <FadeImage uri={art} seed={seed} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={[SHADE.mid, SHADE.transparent, SHADE.transparent, SHADE.mid, SHADE.full]}
          locations={[0, 0.2, 0.45, 0.75, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={[styles.back, { top: insets.top + 6, left: gutters.left }]}>
        <BackButton
          size={40}
          hitSlop={12}
          label={t('common.back')}
          onPress={() => goBack(router)}
        />
      </View>
      <View style={[styles.heroText, { left: gutters.left, right: gutters.right }]}>
        {context ? <Text style={styles.context}>{context}</Text> : null}
        <Text numberOfLines={2} style={styles.heroTitle}>
          {title}
        </Text>
        {meta ? <View style={styles.metaRow}>{meta}</View> : null}
      </View>
    </View>
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
      contentContainerStyle={[styles.castRail, gutters.style]}
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

const styles = StyleSheet.create({
  back: { position: 'absolute', zIndex: 2 },
  heroText: {
    position: 'absolute',
    bottom: spacing.sm,
    gap: 6,
  },
  context: { ...type.caption, color: colors.accent, fontWeight: '700' },
  heroTitle: {
    ...type.display,
    fontSize: 32,
    textShadowColor: 'rgba(10, 10, 12, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: {
    backgroundColor: 'rgba(28, 28, 34, 0.85)',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.text },
  castRail: { gap: 12 },
});
