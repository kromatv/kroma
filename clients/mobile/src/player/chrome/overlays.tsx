// Overlays that sit above the video independently of the controls: the subtitle
// cue line, the buffering spinner, skip-intro, and the up-next card.

import { type MediaItem, sizedImageUrl } from '@kroma/core';
import type { SubtitleAppearance } from '@kroma/ui';
import { Button, Icon, Spinner } from '@kroma/ui/kit';
import { Platform, Pressable, StyleSheet, Text, type TextStyle, View } from 'react-native';
import { FadeImage } from '#mobile/components/FadeImage';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { absoluteFill, colors, radius } from '#mobile/lib/theme';

/** The design's subtitle sizes at PHONE scale (the shared model's px are
 * 10-foot numbers). */
const CUE_SIZE: Record<SubtitleAppearance['size'], number> = { sm: 13, md: 17, lg: 21, xl: 26 };

const CUE_FONT: Record<SubtitleAppearance['font'], string | undefined> = {
  sans: undefined,
  serif: Platform.select({ ios: 'Georgia', default: 'serif' }),
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};

/** The viewer's appearance choice, as the cue Text's style. Mirrors the shared
 * renderer's treatment: `box` carries the background at its own opacity, the
 * other edges drop the box and draw a shadow (or nothing). */
function cueStyle(a: SubtitleAppearance): TextStyle {
  const alpha = Math.round((a.opacity / 100) * 255)
    .toString(16)
    .padStart(2, '0');
  const shadowRadius = { none: 0, box: 0, shadow: 4, outline: 1.5 }[a.edge];
  return {
    color: `${a.color}${alpha}`,
    fontSize: CUE_SIZE[a.size],
    fontFamily: CUE_FONT[a.font],
    backgroundColor: a.edge === 'box' ? `rgba(10, 10, 12, ${a.bgOpacity / 100})` : 'transparent',
    textShadowColor: a.edge === 'shadow' || a.edge === 'outline' ? 'rgba(0, 0, 0, 0.9)' : undefined,
    textShadowRadius: shadowRadius,
    textShadowOffset: a.edge === 'shadow' ? { width: 0, height: 1 } : { width: 0, height: 0 },
  };
}

/** The current subtitle line. It rides above the controls when they are up, so
 * the two never overlap. */
export function CueLine({
  cue,
  bottom,
  appearance,
}: Readonly<{ cue: string; bottom: number; appearance: SubtitleAppearance }>) {
  if (!cue) return null;
  return (
    <View style={[styles.cueBox, { bottom }]}>
      <Text style={[styles.cueText, cueStyle(appearance)]}>{cue}</Text>
    </View>
  );
}

export function BufferingSpinner() {
  return (
    <View style={styles.centerOverlay} pointerEvents="none">
      <Spinner size={40} color={colors.text} />
    </View>
  );
}

export function SkipIntroButton({
  onPress,
  bottom,
}: Readonly<{ onPress(): void; bottom: number }>) {
  const t = useT();
  return (
    <Button
      variant="scrim"
      size="sm"
      label={t('player.skipIntro')}
      style={[styles.skipIntro, { bottom }]}
      onPress={onPress}
    />
  );
}

export function UpNextCard({
  next,
  onPlayNext,
  bottom,
}: Readonly<{
  next: MediaItem;
  onPlayNext(): void;
  bottom: number;
}>) {
  const t = useT();
  const client = useClient();
  const thumb = sizedImageUrl(client.backdropFor(next) ?? client.posterFor(next), 320);
  return (
    <Pressable onPress={onPlayNext} style={[styles.upNext, { bottom }]}>
      <FadeImage uri={thumb} seed={next.id} radius={6} style={styles.upNextThumb} />
      <View style={styles.upNextText}>
        <Text style={styles.upNextLabel}>{t('player.nextEpisode')}</Text>
        <Text numberOfLines={1} style={styles.upNextTitle}>
          {next.episodeTitle ?? next.title}
        </Text>
      </View>
      <Icon name="player-play-filled" size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centerOverlay: { ...absoluteFill, alignItems: 'center', justifyContent: 'center' },
  cueBox: { position: 'absolute', left: 40, right: 40, alignItems: 'center' },
  cueText: {
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  skipIntro: { position: 'absolute', right: 32 },
  upNext: {
    position: 'absolute',
    right: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(10, 10, 12, 0.85)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: 8,
    paddingRight: 14,
    maxWidth: 320,
  },
  upNextThumb: { width: 84, height: 47 },
  upNextText: { flexShrink: 1 },
  upNextLabel: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  upNextTitle: { color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 2 },
});
