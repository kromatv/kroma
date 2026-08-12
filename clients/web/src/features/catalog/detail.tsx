import {
  canDirectPlay,
  channelLabel,
  codecLabel,
  type ItemId,
  langName,
  type MediaItem,
  posterColors,
  type Translate,
  type VideoTrack,
} from '@kroma/core';
import { useT, useThemeAudio } from '@kroma/ui';
import {
  BackButton,
  Badge,
  Box,
  Button,
  color,
  DataField,
  Ground,
  gradient,
  IconButton,
  Text,
  useBreakpoint,
} from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { HeroBackdrop } from '#web/features/catalog/hero-backdrop';
import { Image } from '#web/shared/ui';
import { CastButton } from '#web/shared/ui/cast-button';

export type { SimilarItem } from '#web/features/catalog/detail-rails';
// Re-exported so existing importers (the person route, AvDrawer, the movie
// route) keep their `#web/features/catalog/detail` path.
export { CastRail, initials, SimilarRail } from '#web/features/catalog/detail-rails';

export type QualityTone = '4K' | 'HDR' | 'H.265';

/** Quality pills shown beside the meta line (mirrors the design's `cur.badges`). */
export function qualityBadges(video: VideoTrack | null | undefined): QualityTone[] {
  if (!video) return [];
  const out: QualityTone[] = [];
  if ((video.width ?? 0) >= 3840) out.push('4K');
  if (video.hdr) out.push('HDR');
  if (video.codec === 'hevc') out.push('H.265');
  return out;
}

// `langName` is re-exported so existing importers (AvDrawer, movie route) keep
// their `#web/features/catalog/detail` path; the implementation now lives in @kroma/core.
export { langName };

/** "Français · AAC 5.1" language then codec/channels. */
export function audioString(t: Translate, item: Pick<MediaItem, 'audio'>): string {
  const a = item.audio;
  if (!a) return '-';
  const tech = [codecLabel(a.codec), channelLabel(a.channels)].filter(Boolean).join(' ');
  return [langName(t, a.language), tech].filter(Boolean).join(' · ') || '-';
}

/** Warning-pill label for a problematic loudness verdict, or null when the mix
 * is fine / not analyzed yet (server `pipeline.loudness` stage). */
export function audioFlagLabel(
  t: Translate,
  item: Pick<MediaItem, 'audioAnalysis'> | null | undefined,
): string | null {
  switch (item?.audioAnalysis?.verdict) {
    case 'highDynamics':
      return t('content.audioHighDynamics');
    case 'quietDialog':
      return t('content.audioQuietDialog');
    default:
      return null;
  }
}

/** Distinct subtitle languages, or "Aucun". */
export function subString(t: Translate, item: Pick<MediaItem, 'subtitles'>): string {
  const langs = [...new Set(item.subtitles.map((s) => langName(t, s.language)).filter(Boolean))];
  return langs.length ? langs.join(', ') : t('subtitle.none');
}

// `62vh`, the fluid gutter and an inherited `text-shadow` are all browser-only,
// so the hero's frame and its text column stay plain elements.
const HERO_FRAME: CSSProperties = { position: 'relative', minHeight: '62vh' };

const GUTTER: CSSProperties = {
  paddingLeft: 'var(--gutter-web)',
  paddingRight: 'var(--gutter-web)',
};

const HERO_TEXT: CSSProperties = {
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
const FIELD_GAP_X = { base: 24, md: 44 } as const;
const NO_CAPS = { textTransform: 'none' } as const;
const ITALIC = { fontStyle: 'italic' } as const;
const RULE = { borderTopWidth: 1, borderTopColor: color('white/8') } as const;

export interface DetailHeroProps {
  art: { id: string; backdrop: string | null; poster: string };
  overline: string;
  title: string;
  rating?: number | null;
  meta: string;
  badges: QualityTone[];
  audioFlag?: string | null;
  directors?: string[];
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

// A run of inline links inside one paragraph: the kit lays a control out as a
// block, so these stay <button>s and carry a standing underline rather than a
// hover-only one.
const DIRECTOR_LINK: CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  textDecoration: 'underline',
  textUnderlineOffset: 2,
  cursor: 'pointer',
};

const BOLD = { fontWeight: '600' } as const;

function DirectorsLine({ directors }: Readonly<{ directors?: string[] }>) {
  const t = useT();
  const navigate = useNavigate();
  if (!directors || directors.length === 0) return null;
  return (
    <Text variant="meta" color="white/60" mb={12}>
      <Text variant="meta" color="white/80" style={BOLD}>
        {t('content.directedBy')}
      </Text>{' '}
      {directors.map((d, i) => (
        <span key={d}>
          {i > 0 ? ', ' : ''}
          <button
            type="button"
            onClick={() => navigate({ to: '/person/$name', params: { name: d } })}
            aria-label={t('person.viewWorks', { name: d })}
            style={DIRECTOR_LINK}
          >
            {d}
          </button>
        </span>
      ))}
    </Text>
  );
}

function WatchedButton({
  watched,
  onToggle,
}: Readonly<{ watched?: boolean; onToggle?: () => void }>) {
  const t = useT();
  if (!onToggle) return null;
  return (
    <Button
      variant="outline"
      active={watched ?? false}
      icon="check"
      label={watched ? t('content.watched') : t('content.markWatched')}
      onPress={onToggle}
    />
  );
}

function ListButton({ inList, onToggle }: Readonly<{ inList?: boolean; onToggle?: () => void }>) {
  const t = useT();
  if (!onToggle) return null;
  return (
    <IconButton
      diameter={50}
      glyph={20}
      radius="md"
      active={inList ?? false}
      icon={inList ? 'check' : 'plus'}
      label={inList ? t('content.removeFromList') : t('content.addToList')}
      onPress={onToggle}
    />
  );
}

function ReportButton({ onReport }: Readonly<{ onReport?: () => void }>) {
  const t = useT();
  if (!onReport) return null;
  return (
    <IconButton
      diameter={50}
      glyph={19}
      radius="md"
      icon="flag"
      label={t('report.action')}
      onPress={onReport}
    />
  );
}

function HeroFields({ audio, subtitles }: Readonly<{ audio?: string; subtitles?: string }>) {
  const t = useT();
  if (audio == null && subtitles == null) return null;
  return (
    <Box row wrap gapX={FIELD_GAP_X} gapY={16} py={18} style={RULE}>
      {audio != null ? (
        <DataField.Root size="md">
          <DataField.Label>{t('content.fieldAudio')}</DataField.Label>
          <DataField.Value>{audio}</DataField.Value>
        </DataField.Root>
      ) : null}
      {subtitles != null ? (
        <DataField.Root size="md">
          <DataField.Label>{t('content.fieldSubtitles')}</DataField.Label>
          <DataField.Value>{subtitles}</DataField.Value>
        </DataField.Root>
      ) : null}
    </Box>
  );
}
