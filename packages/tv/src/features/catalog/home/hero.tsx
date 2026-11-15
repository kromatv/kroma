import type { MediaCard } from '@kromatv/client/media';
import { formatRuntime, genreLabels, posterColors, synopsisLead } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import {
  Badge,
  Box,
  Button,
  colors,
  type FocusHandle,
  FocusRegion,
  Img,
  ScrollMask,
  qualityTone,
  RING_ROOM,
  styles,
  Text,
  typeSpec as textRoles,
  fontSizes as textSizes,
  tintGradient,
  useStyles,
  Veil,
} from '@kromatv/ui/kit';
import { useEffect, useRef, useState } from 'react';
import type { HeroSlide } from '#tv/features/catalog/home/hero-slides';
import {
  entryId,
  entryMetadata,
  entryTitle,
  type HomeEntry,
} from '#tv/features/catalog/home/sectionEntry';
import { useHeroPager } from '#tv/features/catalog/home/use-hero-pager';

const HERO_VEIL_HORIZONTAL = `linear-gradient(90deg, ${colors.bg} 5%, transparent 60%)`;
const HERO_VEIL_VERTICAL = `linear-gradient(0deg, ${colors.bg} 1%, transparent 48%)`;
const HERO_VEIL = `${HERO_VEIL_VERTICAL}, ${HERO_VEIL_HORIZONTAL}`;

const HERO_HEIGHT = 691;
const HERO_EMPTY_HEIGHT = 432;

const DOT = 8;
const DOT_SHOWN = 28;

const SYNOPSIS_BUDGET = 220;

const sDefinition = styles({
  titleGap: { mt: 16, mb: 14 },
  moreInfo: { px: 34 },
  heroActions: { row: true, gap: 18 },
  heroTitle: {
    fontSize: textRoles.heroTv.size,
    lineHeight: 79,
    fontWeight: '700',
    letterSpacing: -1.64,
  },
  featuredLabel: { fontSize: textSizes.compactLabel },
  copy: {
    position: 'absolute',
    left: 64 - RING_ROOM,
    bottom: 36 - RING_ROOM,
    zIndex: 2,
    maxWidth: 820 + RING_ROOM * 2,
    p: RING_ROOM,
  },
});

type HeroButton = 'primary' | 'secondary';

export interface HeroProps {
  slides: readonly HeroSlide[];
  onPlay: (m: MediaCard) => void;
  onSelectEntry: (e: HomeEntry) => void;
  maskInset: number;
}

/** The home screen's cinematic spotlight, one entry at a time, or a spacer
 * while there is nothing to feature. Left on its first button and Right on its
 * last page through the entries. */
export function Hero({ slides, onPlay, onSelectEntry, maskInset }: Readonly<HeroProps>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const primary = useRef<FocusHandle>(null);
  const [focused, setFocused] = useState<HeroButton | null>(null);
  const held = focused !== null;
  const { index, page, touch } = useHeroPager({ count: slides.length, held });

  const shownBefore = useRef(index);
  useEffect(() => {
    if (shownBefore.current === index) {
      return;
    }
    shownBefore.current = index;
    if (held) {
      primary.current?.focus();
    }
  }, [index, held]);

  const slide = slides[index];
  if (!slide) {
    return <Box h={HERO_EMPTY_HEIGHT} />;
  }
  const { entry } = slide;
  const id = entryId(entry);
  const meta = entryMetadata(entry);
  const synopsis = synopsisLead(meta?.overview, SYNOPSIS_BUDGET);
  const last: HeroButton = entry.type === 'movie' ? 'secondary' : 'primary';
  const leave = (button: HeroButton) => setFocused((at) => (at === button ? null : at));

  return (
    <Box h={HERO_HEIGHT}>
      <Img
        src={slide.backdrop}
        background={tintGradient(posterColors(id))}
        position="50% 22%"
        priority
        fill
        layered
        opaque
      />
      <Veil ramp={HERO_VEIL} />
      <ScrollMask inset={maskInset} style={s.copy}>
        <Text variant="overlineTv" style={s.featuredLabel} color="accentText">
          {slide.note ?? t('content.featured')}
        </Text>
        <Text variant="hero" style={[s.heroTitle, s.titleGap]}>
          {entryTitle(entry)}
        </Text>
        <Box row wrap align="center" gap={12} mb={14}>
          {meta?.rating ? (
            <>
              <Text variant="strongTv" color="accentText">
                {`${meta.rating.toFixed(1)}★`}
              </Text>
              <Text variant="labelTv" color="textDim">
                ·
              </Text>
            </>
          ) : null}
          <Text variant="labelTv" color="textMuted">
            {heroLine(t, entry)}
          </Text>
          {slide.badge ? <Badge tone={qualityTone(slide.badge)}>{slide.badge}</Badge> : null}
        </Box>
        {synopsis ? (
          <Text variant="bodyTv" maxW={720} mb={22} color="text/82">
            {synopsis}
          </Text>
        ) : null}
        <FocusRegion
          style={s.heroActions}
          onKey={(direction) => {
            touch();
            if (slides.length < 2) {
              return false;
            }
            if (direction === 'left' && focused === 'primary') {
              page(-1);
            } else if (direction === 'right' && focused === last) {
              page(1);
            } else {
              return false;
            }
            return true;
          }}
        >
          <Button
            size="tv"
            // Home's entry point: the hero's own action, which is what the
            // design puts the eye on.
            autoFocus
            focusHandle={primary}
            icon={entry.type === 'movie' ? 'player-play-filled' : undefined}
            label={entry.type === 'movie' ? t('content.play') : t('content.moreInfo')}
            onPress={() => (entry.type === 'movie' ? onPlay(entry.item) : onSelectEntry(entry))}
            onFocus={() => setFocused('primary')}
            onBlur={() => leave('primary')}
          />
          {entry.type === 'movie' ? (
            <Button
              size="tv"
              variant="outline"
              label={t('content.moreInfo')}
              onPress={() => onSelectEntry(entry)}
              onFocus={() => setFocused('secondary')}
              onBlur={() => leave('secondary')}
              style={s.moreInfo}
            />
          ) : null}
        </FocusRegion>
        {slides.length > 1 ? (
          <Box
            row
            gap={DOT}
            mt={24}
            role="img"
            accessibilityLabel={t('content.heroPosition', {
              current: index + 1,
              total: slides.length,
            })}
          >
            {slides.map((each, at) => (
              <Box
                key={entryId(each.entry)}
                w={at === index ? DOT_SHOWN : DOT}
                h={DOT}
                radius="pill"
                bg={at === index ? 'accent' : 'text/30'}
              />
            ))}
          </Box>
        ) : null}
      </ScrollMask>
    </Box>
  );
}

// Year · runtime · genre (quality lives in the badge). Shows have no
// runtime, so it's just year · genre.
function heroLine(t: Translate, e: HomeEntry): string {
  if (e.type === 'show') {
    return [e.show.year ? String(e.show.year) : null, genreLabels(t, e.show.metadata)[0]]
      .filter(Boolean)
      .join(' · ');
  }
  const m = e.item;
  return [
    m.year ? String(m.year) : null,
    formatRuntime(m.durationMs),
    genreLabels(t, m.metadata)[0],
  ]
    .filter(Boolean)
    .join(' · ');
}
