import { metaLine, posterColors } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import {
  Badge,
  Box,
  Button,
  classes,
  Row,
  Skeleton,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import type { MovieCardView } from '#web/shared/lib/api';
import type { HeroEntry } from '#web/shared/lib/queries';
import { Image } from '#web/shared/ui';
import { RouteLink } from '#web/shared/ui/route-link';

type HeroBadge = '4K' | 'HDR' | 'H.265';

function heroBadges(v: MovieCardView['video']): HeroBadge[] {
  if (!v) return [];
  const out: HeroBadge[] = [];
  if ((v.width ?? 0) >= 3840) out.push('4K');
  if (v.hdr) out.push('HDR');
  if (v.codec === 'hevc') out.push('H.265');
  return out;
}

// Bled to the content edges (cancels the page gutter) and faded into the rails
// below. The gutter is a fluid CSS custom property, which no style number can
// carry, so the frame stays a plain element.
const sDefinition = styles({
  hero: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginLeft: 'calc(var(--gutter-web) * -1)',
    marginRight: 'calc(var(--gutter-web) * -1)',
    mt: -36,
    mb: 32,
    minHeight: 'clamp(200px, 52vw, 460px)',
    paddingLeft: 'var(--gutter-web)',
    paddingRight: 'var(--gutter-web)',
    paddingTop: 'clamp(40px, 5vw, 64px)',
    pb: 40,
  },
  breathe: {
    fill: true,
    pointerEvents: 'none',
    animationKeyframes: 'kroma-breathe',
    animationDuration: '7s',
    animationTimingFunction: 'var(--ease-out)',
    animationIterationCount: 'infinite',
    backgroundImage:
      'radial-gradient(58% 68% at 72% 32%, color-mix(in srgb, var(--kroma-accent-wash) 16%, transparent), transparent 62%)',
  },
  scrim: {
    backgroundImage: [
      'linear-gradient(90deg, var(--kroma-bg) 6%,',
      'color-mix(in srgb, var(--kroma-bg) 35%, transparent) 42%, transparent 64%),',
      'linear-gradient(0deg, var(--kroma-bg) 2%, transparent 46%)',
    ].join(' '),
  },
});

/** Full-bleed featured banner TMDB backdrop as cinematic art, bled to the
 * content edges (cancels the page gutter) and faded into the rails below. */
export function Hero({ entry }: Readonly<{ entry: HeroEntry }>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const media = entry.type === 'movie' ? entry.movie : entry.show;
  const colors = posterColors(media.id);
  const gradient = `linear-gradient(158deg, ${colors[0]}, ${colors[1]})`;
  const meta = media.metadata;
  const badges = heroBadges(media.video);
  const line =
    entry.type === 'movie'
      ? metaLine(entry.movie)
      : [entry.show.year, t('content.seasonCount', { count: entry.show.seasonCount })]
          .filter(Boolean)
          .join(' · ');

  return (
    <div className={classes(s.hero)}>
      <Image
        src={media.backdrop}
        fit="cover"
        position="center 18%"
        background={gradient}
        fill
        priority
      />
      <Box style={s.breathe} />
      <Box fill pointerEvents="none" style={s.scrim} />

      <Box maxW={680}>
        <Text variant="overline" color="accent" mb={14}>
          {t('content.featured')}
        </Text>
        <Text variant="hero" mb={14}>
          {media.title}
        </Text>
        <Row wrap gap={12} mb={16}>
          {meta?.rating ? (
            <Text variant="meta" color="accent">{`${meta.rating.toFixed(1)}★`}</Text>
          ) : null}
          <Text variant="meta" color="textMuted">
            {line}
          </Text>
          {badges.map((b) => (
            <Badge key={b} tone={b}>
              {b}
            </Badge>
          ))}
        </Row>
        {meta?.overview ? (
          <Text variant="body" lines={3} maxW={540} mb={20}>
            {meta.overview}
          </Text>
        ) : null}
        <Row wrap gap={14}>
          {entry.type === 'movie' ? (
            <>
              <Button label={t('content.play')} asChild>
                <RouteLink to="/watch/$id" params={{ id: media.id }} />
              </Button>
              <Button variant="glass" label={t('content.moreInfo')} asChild>
                <RouteLink to="/movies/$id" params={{ id: media.id }} />
              </Button>
            </>
          ) : (
            <Button label={t('content.moreInfo')} asChild>
              <RouteLink to="/shows/$id" params={{ id: media.id }} />
            </Button>
          )}
        </Row>
      </Box>
    </div>
  );
}

/** The banner's frame, held while the featured pick is on its way. */
export function HeroSkeleton() {
  const s = useStyles(sDefinition);

  return (
    <div className={classes(s.hero)} aria-hidden>
      <Box fill>
        <Skeleton h="100%" w="100%" radius={0} />
      </Box>
    </div>
  );
}
