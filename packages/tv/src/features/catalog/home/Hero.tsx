import {
  formatRuntime,
  type KromaClient,
  type MediaItem,
  posterColors,
  qualityBadge,
  qualityBadgeForVideo,
  type Section,
  type SectionItem,
  type Show,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Badge,
  Box,
  Button,
  colors,
  FocusRegion,
  gradient,
  Img,
  qualityTone,
  styles,
  Text,
  tintGradient,
} from '@kroma/ui/kit';
import { entryId, entryMetadata } from '#tv/features/catalog/home/sectionEntry';

// Two layers rather than one comma-separated background-image: a multi-value
// background is a CSS-only luxury React Native's gradient support lacks.
const HERO_VEIL_HORIZONTAL = `linear-gradient(90deg, ${colors.bg} 5%, transparent 60%)`;
const HERO_VEIL_VERTICAL = `linear-gradient(0deg, ${colors.bg} 1%, transparent 48%)`;

const HERO_HEIGHT = 691;
const HERO_EMPTY_HEIGHT = 432;

// The hero fills the 1920 stage, but a backdrop master is a TMDB w1280 and the
// server's widest bucket is 960, so there is nothing sharper to ask for.
const HERO_W = 960;

const s = styles({
  heroActions: { row: true, gap: 18 },
  heroTitle: { fontSize: 82, lineHeight: 79, fontWeight: '700', letterSpacing: -1.64 },
  featuredLabel: { fontSize: 14 },
});

export interface HeroInfo {
  hero: SectionItem | null;
  heroId: string | null;
  heroMeta: ReturnType<typeof entryMetadata> | null;
  heroBackdrop: string | null;
  heroBadge: string | null;
}

// The featured spotlight: the server's daily pick, falling back to the first
// entry of the top server section, then to the first catalog movie so the
// hero is never empty.
export function computeHero(
  featured: SectionItem | null,
  sections: Section[],
  movies: MediaItem[],
  client: KromaClient,
): HeroInfo {
  const hero: SectionItem | null =
    featured ?? sections[0]?.items[0] ?? (movies[0] ? { type: 'movie', item: movies[0] } : null);
  const heroId = hero ? entryId(hero) : null;
  const heroMeta = hero ? entryMetadata(hero) : null;
  let heroBackdrop: string | null = null;
  if (hero) {
    heroBackdrop =
      hero.type === 'show'
        ? (client.backdropFor(hero.show, HERO_W) ?? client.showPosterFor(hero.show, HERO_W))
        : (client.backdropFor(hero.item, HERO_W) ?? client.posterFor(hero.item, HERO_W));
  }
  let heroBadge: string | null = null;
  if (hero) {
    heroBadge =
      hero.type === 'show' ? qualityBadgeForVideo(hero.show.video) : qualityBadge(hero.item);
  }
  return { hero, heroId, heroMeta, heroBackdrop, heroBadge };
}

export interface HeroProps {
  info: HeroInfo;
  onPlay: (m: MediaItem) => void;
  onSelectShow: (show: Show) => void;
  onSelectEntry: (e: SectionItem) => void;
}

/** The home screen's cinematic spotlight, or a spacer while there is nothing to feature. */
export function Hero({ info, onPlay, onSelectShow, onSelectEntry }: Readonly<HeroProps>) {
  const t = useT();
  const { hero, heroId, heroMeta, heroBackdrop, heroBadge } = info;
  if (!hero || !heroId) return <Box h={HERO_EMPTY_HEIGHT} />;
  return (
    <Box h={HERO_HEIGHT}>
      <Img
        src={heroBackdrop}
        background={tintGradient(posterColors(heroId))}
        position="50% 22%"
        priority
        fill
      />
      <Box fill pointerEvents="none" style={gradient(HERO_VEIL_HORIZONTAL)} />
      <Box fill pointerEvents="none" style={gradient(HERO_VEIL_VERTICAL)} />
      <Box absolute left={64} bottom={36} z={2} maxW={820}>
        <Text variant="overlineTv" style={s.featuredLabel} color="accentText">
          {t('content.featured')}
        </Text>
        <Text variant="hero" style={[s.heroTitle, { marginTop: 16, marginBottom: 14 }]}>
          {hero.type === 'show' ? hero.show.title : hero.item.title}
        </Text>
        <Box row wrap align="center" gap={12} mb={14}>
          {heroMeta?.rating ? (
            <>
              <Text variant="strongTv" color="accentText">
                {`${heroMeta.rating.toFixed(1)}\u2605`}
              </Text>
              <Text variant="labelTv" color="textDim">
                ·
              </Text>
            </>
          ) : null}
          <Text variant="labelTv" color="textMuted">
            {heroLine(hero)}
          </Text>
          {heroBadge ? <Badge tone={qualityTone(heroBadge)}>{heroBadge}</Badge> : null}
        </Box>
        {heroMeta?.overview ? (
          <Text lines={3} variant="bodyTv" maxW={720} mb={22} color="text/82">
            {heroMeta.overview}
          </Text>
        ) : null}
        {/* The hero's two actions are one row: Left and Right move
            between them, Up and Down leave for the bar or the rails. */}
        <FocusRegion style={s.heroActions}>
          <Button
            size="tv"
            // Home's entry point: the hero's own action, which is what the
            // design puts the eye on.
            autoFocus
            icon="player-play-filled"
            label={hero.type === 'movie' ? t('player.play') : t('content.moreInfo')}
            onPress={() => (hero.type === 'movie' ? onPlay(hero.item) : onSelectShow(hero.show))}
          />
          <Button
            size="tv"
            variant="outline"
            label={t('content.moreInfo')}
            onPress={() => onSelectEntry(hero)}
            style={{ paddingHorizontal: 34 }}
          />
        </FocusRegion>
      </Box>
    </Box>
  );
}

// Year · runtime · genre (quality lives in the badge). Shows have no
// runtime, so it's just year · genre.
function heroLine(e: SectionItem): string {
  if (e.type === 'show') {
    return [e.show.year ? String(e.show.year) : null, e.show.metadata?.genres?.[0]]
      .filter(Boolean)
      .join(' · ');
  }
  const m = e.item;
  return [m.year ? String(m.year) : null, formatRuntime(m.durationMs), m.metadata?.genres?.[0]]
    .filter(Boolean)
    .join(' · ');
}
