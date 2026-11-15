import type { SubjectId } from '@kromatv/client/media';
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
import { RouteLink } from '#web/shared/ui/route-link.component';

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

function SlideFacts({ entry }: Readonly<{ entry: HomeEntry }>) {
  const t = useT();
  const rating = entryMetadata(entry)?.rating;
  const badge =
    entry.type === 'show' ? qualityBadgeForVideo(entry.show.video) : qualityBadge(entry.item);

  return (
    <Row wrap gap={12} mb={14}>
      {rating ? <Text variant="meta" color="accent">{`${rating.toFixed(1)}★`}</Text> : null}
      <Text variant="meta" color="textMuted">
        {entryFacts(t, entry).join(' · ')}
      </Text>
      {badge ? <Badge tone={qualityTone(badge)}>{badge}</Badge> : null}
    </Row>
  );
}

function SlideSave({ id }: Readonly<{ id: SubjectId }>) {
  const t = useT();
  const { inList, toggle } = useMyList();
  const saved = inList(id);

  return (
    <IconButton
      variant="glass"
      icon={saved ? 'bookmark-filled' : 'bookmark'}
      label={t(saved ? 'content.removeFromList' : 'content.addToList')}
      pressed={saved}
      active={saved}
      onPress={() => toggle(id)}
    />
  );
}

function SlideActions({ entry }: Readonly<{ entry: HomeEntry }>) {
  const t = useT();

  return (
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
      <SlideSave id={entryId(entry)} />
    </Row>
  );
}

/** What one hero title says about itself, and the ways into it. */
export function HeroSlide({ entry, note, position }: Readonly<HeroSlideProps>) {
  const s = useStyles(sDefinition);
  const synopsis = synopsisLead(entryMetadata(entry)?.overview, SYNOPSIS_BUDGET);

  return (
    <Box style={s.copy} accessibilityLabel={position} aria-roledescription="slide">
      <Text variant="overline" color="accent" mb={12}>
        {note}
      </Text>
      <Text variant="hero" accessibilityRole="header" lines={2} mb={14}>
        {entryTitle(entry)}
      </Text>
      <SlideFacts entry={entry} />
      {synopsis ? (
        <Text variant="body" maxW={560} mb={22} color="text/82">
          {synopsis}
        </Text>
      ) : null}
      <SlideActions entry={entry} />
    </Box>
  );
}
