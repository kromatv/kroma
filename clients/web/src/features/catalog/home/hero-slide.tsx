import { qualityBadge, qualityBadgeForVideo, synopsisLead } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import {
  Badge,
  Box,
  Button,
  IconButton,
  qualityTone,
  Row,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import {
  entryFacts,
  entryId,
  entryMetadata,
  entryTitle,
  type HomeEntry,
} from '#web/features/catalog/home/entries';
import { entryLink } from '#web/features/catalog/home/entry-link';
import { useMyList } from '#web/shared/lib/mylist';
import { RouteLink } from '#web/shared/ui/route-link';

const SYNOPSIS_BUDGET = 240;

const sDefinition = styles({
  copy: {
    maxW: 640,
    animationKeyframes: 'fade-in',
    animationDuration: '600ms',
    animationTimingFunction: 'var(--ease-out)',
  },
});

export interface HeroSlideProps {
  entry: HomeEntry;
  note: string;
  position: string;
}

/** What one hero title says about itself, and the ways into it. */
export function HeroSlide({ entry, note, position }: Readonly<HeroSlideProps>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const { inList, toggle } = useMyList();
  const id = entryId(entry);
  const metadata = entryMetadata(entry);
  const badge =
    entry.type === 'show' ? qualityBadgeForVideo(entry.show.video) : qualityBadge(entry.item);
  const saved = inList(id);
  const synopsis = synopsisLead(metadata?.overview, SYNOPSIS_BUDGET);

  return (
    <Box style={s.copy} accessibilityLabel={position} aria-roledescription="slide">
      <Text variant="overline" color="accent" mb={12}>
        {note}
      </Text>
      <Text variant="hero" accessibilityRole="header" lines={2} mb={14}>
        {entryTitle(entry)}
      </Text>
      <Row wrap gap={12} mb={14}>
        {metadata?.rating ? (
          <Text variant="meta" color="accent">{`${metadata.rating.toFixed(1)}★`}</Text>
        ) : null}
        <Text variant="meta" color="textMuted">
          {entryFacts(t, entry).join(' · ')}
        </Text>
        {badge ? <Badge tone={qualityTone(badge)}>{badge}</Badge> : null}
      </Row>
      {synopsis ? (
        <Text variant="body" maxW={560} mb={22} color="text/82">
          {synopsis}
        </Text>
      ) : null}
      <Row wrap gap={12}>
        {entry.type === 'movie' ? (
          <Button icon="player-play-filled" label={t('content.play')} asChild>
            <RouteLink to="/watch/$id" params={{ id: entry.item.id }} />
          </Button>
        ) : null}
        <Button
          variant={entry.type === 'movie' ? 'glass' : undefined}
          icon="info-circle"
          label={t('content.moreInfo')}
          asChild
        >
          {entryLink(entry)}
        </Button>
        <IconButton
          variant="glass"
          icon={saved ? 'bookmark-filled' : 'bookmark'}
          label={t(saved ? 'content.removeFromList' : 'content.addToList')}
          pressed={saved}
          active={saved}
          onPress={() => toggle(id)}
        />
      </Row>
    </Box>
  );
}
