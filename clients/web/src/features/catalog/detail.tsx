import {
  type CrewMember,
  canDirectPlay,
  type ItemId,
  type MediaItem,
  posterColors,
} from '@kroma/core';
import { useT, useThemeAudio } from '@kroma/ui';
import {
  BackButton,
  Badge,
  Box,
  Button,
  color,
  Ground,
  gradient,
  IconButton,
  Text,
  useBreakpoint,
} from '@kroma/ui/kit';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import {
  DirectorsLine,
  HeroFields,
  ListButton,
  ReportButton,
  WatchedButton,
} from '#web/features/catalog/detail-hero-parts';
import { HeroBackdrop } from '#web/features/catalog/hero-backdrop';
import type { QualityTone } from '#web/features/catalog/media-labels';
import { Image } from '#web/shared/ui';
import { CastButton } from '#web/shared/ui/cast-button';

export type { SimilarItem } from '#web/features/catalog/detail-rails';
export { CastRail, initials, SimilarRail } from '#web/features/catalog/detail-rails';
export type { QualityTone } from '#web/features/catalog/media-labels';
export {
  audioFlagLabel,
  audioString,
  langName,
  qualityBadges,
  subString,
} from '#web/features/catalog/media-labels';

const HERO_FRAME: CSSProperties = { position: 'relative', minHeight: '62vh' };

const GUTTER: CSSProperties = {
  paddingLeft: 'var(--gutter-web)',
  paddingRight: 'var(--gutter-web)',
};

// A column, stated: this is an element rather than a <Box> because `textShadow`
// has no React Native spelling, and a plain block leaves react-native-web's
// <Text> at its own `display: inline`. Three of them in a row then run together
// as one paragraph with their margins dropped, which is what put the director,
// the tagline and the overview on the same line.
const HERO_TEXT: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  maxWidth: 680,
  textShadow: `0 1px 3px ${color('black/50')}, 0 2px 16px ${color('black/55')}`,
};

const HERO_TITLE: CSSProperties = {
  textShadow: [
    `0 0 2px ${color('black/55')}`,
    `0 2px 8px ${color('black/55')}`,
    `0 8px 30px ${color('black/60')}`,
  ].join(', '),
};

const CORNER_LEFT = { base: 16, md: 32 } as const;
const CORNER_TOP = { base: 16, md: 26 } as const;
const HERO_GAP = { base: 24, md: 40 } as const;
const HERO_PAD_TOP = { base: 48, md: 90 } as const;
const POSTER_W = { base: 192, lg: 240 } as const;
const NO_CAPS = { textTransform: 'none' } as const;
const ITALIC = { fontStyle: 'italic' } as const;

export interface DetailHeroProps {
  art: { id: string; backdrop: string | null; poster: string };
  overline: string;
  title: string;
  rating?: number | null;
  meta: string;
  badges: QualityTone[];
  audioFlag?: string | null;
  directors?: CrewMember[];
  tagline?: string | null;
  overview?: string | null;
  audio?: string;
  subtitles?: string;
  playLabel?: string;
  primaryAction?: ReactNode;
  onBack: () => void;
  onPlay?: () => void;
  castItemId?: ItemId;
  watched?: boolean;
  onToggleWatched?: () => void;
  inList?: boolean;
  onToggleList?: () => void;
  playable?: MediaItem | null;
  themeUrl?: string | null;
  adminAction?: ReactNode;
  onReport?: () => void;
}

/** Full-bleed cinematic detail hero shared by the movie and series fiches
 * (matches the web DETAIL section of KROMA.dc.html). */
export function DetailHero({
  art,
  overline,
  title,
  rating,
  meta,
  badges,
  audioFlag,
  directors,
  tagline,
  overview,
  audio,
  subtitles,
  playLabel,
  primaryAction,
  onBack,
  onPlay,
  castItemId,
  watched,
  onToggleWatched,
  inList,
  onToggleList,
  playable,
  themeUrl,
  adminAction,
  onReport,
}: Readonly<DetailHeroProps>) {
  const t = useT();
  const [c1, c2] = posterColors(art.id);
  const heroGradient = `linear-gradient(135deg, ${c1}, ${c2})`;
  const theme = useThemeAudio(themeUrl);
  // A side column would crush the text into a sliver on a phone, so it is not
  // rendered there rather than hidden with its artwork still fetched.
  const wide = useBreakpoint() !== 'base';

  // Direct-play depends on the runtime's codecs (navigator/MediaSource), so it
  // must stay client-only, or SSR would compute a mismatched hydration value.
  const [unsupported, setUnsupported] = useState<string | null>(null);
  useEffect(() => {
    if (!playable) return setUnsupported(null);
    const v = canDirectPlay(playable);
    setUnsupported(v.canDirectPlay ? null : t(v.messageKey, v.messageVars));
  }, [playable, t]);

  return (
    <div style={HERO_FRAME}>
      <HeroBackdrop backdrop={art.backdrop} gradient={heroGradient} />

      <Box absolute z={3} left={CORNER_LEFT} top={CORNER_TOP}>
        <Ground tone="dark">
          <BackButton diameter={42} label={t('common.back')} onPress={onBack} />
        </Ground>
      </Box>

      <ThemeToggle theme={theme} />

      <div style={GUTTER}>
        <Box row wrap align="flex-end" gap={HERO_GAP} pb={36} pt={HERO_PAD_TOP}>
          {wide ? (
            <Box
              w={POSTER_W}
              aspect={2 / 3}
              shrink={0}
              overflow="hidden"
              radius="lg"
              shadow="hero"
              style={gradient(`linear-gradient(158deg, ${c1}, ${c2})`)}
            >
              <Image src={art.poster} fit="cover" fill />
            </Box>
          ) : null}

          <div style={HERO_TEXT}>
            <Text variant="overline" color="accent" mb={12} style={NO_CAPS}>
              {overline}
            </Text>
            <h1 style={HERO_TITLE}>
              <Text variant="h1" mb={16}>
                {title}
              </Text>
            </h1>

            <Box row wrap align="center" gap={10} mb={18}>
              {rating ? (
                <>
                  <Text variant="label" color="accent">{`${rating.toFixed(1)}★`}</Text>
                  <Text variant="meta" color="white/40">
                    ·
                  </Text>
                </>
              ) : null}
              <Text variant="meta" color="white/72">
                {meta}
              </Text>
              {badges.map((b) => (
                <Badge key={b} tone={b}>
                  {b}
                </Badge>
              ))}
              {audioFlag ? <Badge tone="warning">{audioFlag}</Badge> : null}
            </Box>

            <DirectorsLine directors={directors} />

            {tagline ? (
              <Text variant="meta" color="white/50" mb={12} style={ITALIC}>
                {tagline}
              </Text>
            ) : null}
            {overview ? (
              <Text variant="body" color="white/82" mb={22} lines={wide ? undefined : 4}>
                {overview}
              </Text>
            ) : null}

            <Box row wrap align="center" gap={14} mb={26}>
              {primaryAction ??
                (onPlay ? (
                  <Button
                    icon="player-play-filled"
                    label={playLabel ?? t('content.play')}
                    onPress={onPlay}
                  />
                ) : null)}
              {castItemId ? <CastButton itemId={castItemId} /> : null}
              <WatchedButton watched={watched} onToggle={onToggleWatched} />
              <ListButton inList={inList} onToggle={onToggleList} />
              <ReportButton onReport={onReport} />
              {adminAction}
            </Box>

            <HeroFields audio={audio} subtitles={subtitles} />
            {unsupported ? (
              <Text variant="meta" color="textMuted" mt={14}>
                {unsupported}
              </Text>
            ) : null}
          </div>
        </Box>
      </div>
    </div>
  );
}

function ThemeToggle({ theme }: Readonly<{ theme: ReturnType<typeof useThemeAudio> }>) {
  const t = useT();
  if (!theme.active) return null;
  return (
    <Box absolute z={3} right={CORNER_LEFT} top={CORNER_TOP}>
      <Ground tone="dark">
        <IconButton
          variant="scrim"
          diameter={42}
          glyph={19}
          icon={theme.muted ? 'volume-off' : 'volume'}
          label={theme.muted ? t('content.unmuteTheme') : t('content.muteTheme')}
          onPress={theme.toggle}
        />
      </Ground>
    </Box>
  );
}
