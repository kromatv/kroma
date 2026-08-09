// Overlays that sit above the video independently of the player controls.

import { type MediaItem, sizedImageUrl } from '@kroma/core';
import { type SubtitleAppearance, withOpacity } from '@kroma/ui';
import { Box, Button, Icon, Spinner, styles, Txt } from '@kroma/ui/kit';
import { Platform, Pressable, type TextStyle } from 'react-native';
import { FadeImage } from '#mobile/components/FadeImage';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { colors, radius } from '#mobile/lib/theme';

// Phone scale; the shared appearance model's px are 10-foot numbers.
const CUE_SIZE: Record<SubtitleAppearance['size'], number> = { sm: 13, md: 17, lg: 21, xl: 26 };

// CEA-708's eight font styles. `undefined` is the system face; small caps is a
// variant rather than a family, applied in `cueStyle`.
const CUE_FONT: Record<SubtitleAppearance['font'], string | undefined> = {
  default: undefined,
  propSans: undefined,
  smallCaps: undefined,
  propSerif: Platform.select({ ios: 'Georgia', default: 'serif' }),
  monoSerif: Platform.select({ ios: 'Courier', default: 'monospace' }),
  monoSans: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  casual: Platform.select({ ios: 'Chalkboard SE', default: 'casual' }),
  cursive: Platform.select({ ios: 'Snell Roundhand', default: 'cursive' }),
};

// The edge treatments squeezed into the one text shadow React Native offers.
const CUE_EDGE: Record<
  SubtitleAppearance['edge'],
  { radius: number; offset: { width: number; height: number } }
> = {
  none: { radius: 0, offset: { width: 0, height: 0 } },
  shadow: { radius: 4, offset: { width: 0, height: 1 } },
  uniform: { radius: 1.5, offset: { width: 0, height: 0 } },
  // Not 0: Android removes the shadow layer entirely at radius 0, which would
  // make both of these identical to `none`.
  raised: { radius: 0.01, offset: { width: 1, height: 1 } },
  depressed: { radius: 0.01, offset: { width: -1, height: -1 } },
};

function cueStyle(a: SubtitleAppearance): TextStyle {
  const edge = CUE_EDGE[a.edge];
  return {
    color: withOpacity(a.color, a.opacity),
    fontSize: CUE_SIZE[a.size],
    fontFamily: CUE_FONT[a.font],
    ...(a.font === 'smallCaps' ? ({ fontVariant: ['small-caps'] } as TextStyle) : null),
    backgroundColor: a.bgOpacity > 0 ? withOpacity(a.bgColor, a.bgOpacity) : 'transparent',
    textShadowColor: a.edge === 'none' ? undefined : 'rgba(0, 0, 0, 0.9)',
    textShadowRadius: edge.radius,
    textShadowOffset: edge.offset,
  };
}

export function CueLine({
  cue,
  bottom,
  appearance,
}: Readonly<{ cue: string; bottom: number; appearance: SubtitleAppearance }>) {
  if (!cue) return null;
  return (
    <Box style={[s.cueBox, { bottom }]}>
      <Txt style={[s.cueText, cueStyle(appearance)]}>{cue}</Txt>
    </Box>
  );
}

export function BufferingSpinner() {
  return (
    <Box style={s.centerOverlay} pointerEvents="none">
      <Spinner size={40} color={colors.text} />
    </Box>
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
      style={[s.skipIntro, { bottom }]}
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
    <Pressable onPress={onPlayNext} style={[s.upNext, { bottom }]}>
      <FadeImage uri={thumb} seed={next.id} radius={6} style={s.upNextThumb} />
      <Box style={s.upNextText}>
        <Txt style={s.upNextLabel}>{t('player.nextEpisode')}</Txt>
        <Txt lines={1} style={s.upNextTitle}>
          {next.episodeTitle ?? next.title}
        </Txt>
      </Box>
      <Icon name="player-play-filled" size={20} />
    </Pressable>
  );
}

const s = styles({
  centerOverlay: { fill: true, center: true },
  cueBox: { absolute: true, right: 40, left: 40, align: 'center' },
  cueText: { px: 10, py: 4, radius: 6, overflow: 'hidden', fontWeight: '600', textAlign: 'center' },
  skipIntro: { absolute: true, right: 32 },
  upNext: {
    absolute: true,
    right: 32,
    row: true,
    align: 'center',
    gap: 10,
    maxW: 320,
    p: 8,
    pr: 14,
    bg: 'bg/85',
    radius: radius.md,
    border: 'borderStrong',
  },
  upNextThumb: { w: 84, h: 47 },
  upNextText: { shrink: 1 },
  upNextLabel: { color: 'accent', fontSize: 11, fontWeight: '700' },
  upNextTitle: { mt: 2, color: 'text', fontSize: 13, fontWeight: '600' },
});
