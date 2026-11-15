import { posterColors, synopsisLead } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, Button, classes, Row, styles, Text, useStyles } from '@kromatv/ui/kit';
import {
  entryBackdrop,
  entryFacts,
  entryId,
  entryMetadata,
  entryTitle,
  type HomeEntry,
  type HomeSection,
} from '#web/features/catalog/home/entries';
import { entryLink } from '#web/features/catalog/home/entry-link';
import { useAuth } from '#web/shared/lib/auth';
import { Image } from '#web/shared/ui';
import { RouteLink } from '#web/shared/ui/route-link.component';

const BACKDROP_W = 1280;
const SYNOPSIS_BUDGET = 220;

const sDefinition = styles({
  band: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    mt: 48,
    minHeight: 'clamp(280px, 34vw, 420px)',
    radius: 'xl',
    borderWidth: 1,
    borderColor: 'white/10',
  },
  art: { position: 'absolute', top: 0, right: 0, bottom: 0, left: { base: 0, md: '32%' } },
  scrim: {
    backgroundImage: {
      base: 'linear-gradient(0deg, var(--kroma-bg) 8%, color-mix(in srgb, var(--kroma-bg) 55%, transparent) 46%, transparent 78%)',
      md: [
        'linear-gradient(90deg, var(--kroma-bg) 30%,',
        'color-mix(in srgb, var(--kroma-bg) 78%, transparent) 46%,',
        'color-mix(in srgb, var(--kroma-bg) 20%, transparent) 68%, transparent 86%)',
      ].join(' '),
    },
  },
  copy: { p: { base: 20, md: 36 }, maxW: 560 },
});

function SpotlightArt({ entry }: Readonly<{ entry: HomeEntry }>) {
  const s = useStyles(sDefinition);
  const { client } = useAuth();

  return (
    <Box style={s.art}>
      <Image
        src={entryBackdrop(client, entry, BACKDROP_W)}
        background={`linear-gradient(158deg, ${posterColors(entryId(entry)).join(', ')})`}
        fit="cover"
        position="center 22%"
        fill
      />
    </Box>
  );
}

function SpotlightActions({ entry }: Readonly<{ entry: HomeEntry }>) {
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
        label={t('content.moreInfo')}
        asChild
      >
        {entryLink(entry)}
      </Button>
    </Row>
  );
}

function SpotlightFacts({ entry }: Readonly<{ entry: HomeEntry }>) {
  const t = useT();
  const rating = entryMetadata(entry)?.rating;

  return (
    <Row wrap gap={12} mb={12}>
      {rating ? <Text variant="meta" color="accent">{`${rating.toFixed(1)}★`}</Text> : null}
      <Text variant="meta" color="textMuted">
        {entryFacts(t, entry).join(' · ')}
      </Text>
    </Row>
  );
}

interface SpotlightCopyProps {
  entry: HomeEntry;
  title: string;
  note: string | null;
}

function SpotlightCopy({ entry, title, note }: Readonly<SpotlightCopyProps>) {
  const s = useStyles(sDefinition);
  const synopsis = synopsisLead(entryMetadata(entry)?.overview, SYNOPSIS_BUDGET);

  return (
    <Box style={s.copy}>
      <Row wrap gap={10} mb={10}>
        <Text variant="overline" color="accent">
          {title}
        </Text>
        {note ? (
          <Text variant="overline" color="textMuted">
            {note}
          </Text>
        ) : null}
      </Row>
      <h2>
        <Text variant="h1" lines={2} mb={10}>
          {entryTitle(entry)}
        </Text>
      </h2>
      <SpotlightFacts entry={entry} />
      {synopsis ? (
        <Text variant="body" mb={20} color="text/82">
          {synopsis}
        </Text>
      ) : null}
      <SpotlightActions entry={entry} />
    </Box>
  );
}

/** One title given the width of the page, with why it was picked. */
export function Spotlight({ section }: Readonly<{ section: HomeSection }>) {
  const s = useStyles(sDefinition);
  const entry = section.items[0];
  if (!entry) {
    return null;
  }
  const note = section.notes[entryId(entry)] ?? section.reason ?? null;

  return (
    <section className={classes(s.band)} aria-label={section.title}>
      <SpotlightArt entry={entry} />
      <Box fill pointerEvents="none" style={s.scrim} />
      <SpotlightCopy entry={entry} title={section.title} note={note} />
    </section>
  );
}
