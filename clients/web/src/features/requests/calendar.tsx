// "Bientôt disponible": the coming-soon calendar of upcoming, not-yet-available
// releases (a movie's availability date + a show episode's air date), grouped by
// month and ascending by date. Read-only view over GET /api/requests/calendar.
// Releases landing within the week get the accent date treatment so the
// imminent stuff pops out of the list.

import type { CalendarEntry } from '@kroma/client/requests';
import {
  daysFromToday,
  episodeTag,
  monthKey,
  monthLabel,
  relativeAirDate,
  sentenceCase,
  shortDayLabel,
} from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Box, classes, EmptyState, Icon, PageHeader, Row, styles, Text } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { RequestCard, RequestCardSkeleton } from '#web/features/requests/request-card';
import { userQueries } from '#web/shared/lib/queries';
import { PageFrame } from '#web/shared/ui';
import { RouteLink } from '#web/shared/ui/route-link';

// Releases at most this many days out get the accent "imminent" date.
const IMMINENT_DAYS = 7;

export function ComingSoonPage() {
  const t = useT();
  const locale = useLocale();
  const { data: entries, isPending } = useQuery({
    ...userQueries.calendar(),
    refetchInterval: 60_000,
  });

  // Group the (already date-sorted) entries by month, preserving order. The
  // airDate guard is for the shared, nullable type; the server filters to future dates.
  const groups: Array<{ key: string; label: string; items: CalendarEntry[] }> = [];
  for (const e of entries ?? []) {
    if (!e.airDate) continue;
    const key = monthKey(e.airDate);
    let g = groups.at(-1);
    if (g?.key !== key) {
      g = { key, label: monthLabel(e.airDate, locale), items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }

  return (
    <PageFrame>
      <PageHeader.Root>
        <PageHeader.Title>{t('requests.calendarTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('requests.calendarSubtitle')}</PageHeader.Subtitle>
      </PageHeader.Root>

      {isPending ? <RequestCardSkeleton rows={5} /> : null}

      {entries?.length === 0 ? (
        <EmptyState.Root icon="calendar-clock">
          <EmptyState.Title>{t('requests.calendarEmpty')}</EmptyState.Title>
          <EmptyState.Hint>{t('requests.calendarEmptyHint')}</EmptyState.Hint>
        </EmptyState.Root>
      ) : null}

      {groups.map((g) => (
        <section key={g.key}>
          <h2 className={classes(s.heading)}>
            <Row align="baseline" gap={8} mt={28} mb={10}>
              <Text variant="overline" color="textDim">
                {g.label}
              </Text>
              <Text variant="meta" color="white/35">
                {t('requests.releaseCount', { count: g.items.length })}
              </Text>
            </Row>
          </h2>
          <Box gap={10}>
            {g.items.map((e) => (
              <CalendarRow
                key={`${e.requestId}:${e.season ?? 0}:${e.episode ?? 0}`}
                entry={e}
                locale={locale}
              />
            ))}
          </Box>
        </section>
      ))}
    </PageFrame>
  );
}

function CalendarRow({ entry, locale }: Readonly<{ entry: CalendarEntry; locale: string }>) {
  const t = useT();
  // `episodeTag` is empty for a movie (no season/episode numbering).
  const epTag = episodeTag(entry) || t('requests.movieLabel');
  const airDate = entry.airDate;
  // Bounded on BOTH sides: a row whose date has slipped into the past (a tab
  // left open past local midnight keeps stale rows) is not "imminent".
  const days = airDate != null ? daysFromToday(airDate) : null;
  const imminent = days != null && days >= 0 && days <= IMMINENT_DAYS;

  return (
    <RequestCard
      label={`${entry.title} · ${epTag}`}
      tmdbId={entry.tmdbId}
      posterUrl={entry.posterUrl}
      title={entry.title}
      meta={
        <>
          <Text variant="meta" color="textDim" mt={2}>
            {[entry.year ? String(entry.year) : '', epTag].filter(Boolean).join(' · ')}
          </Text>
          {entry.status === 'grabbed' ? (
            <Row gap={4} mt={4}>
              <Icon name="checks" size={13} thickness={1.9} color="success" />
              <Text variant="meta" color="success">
                {t('requests.securedShort')}
              </Text>
            </Row>
          ) : null}
        </>
      }
      trailing={
        <Box align="flex-end" shrink={0}>
          <Text variant="label" color={imminent ? 'accent' : 'text'}>
            {airDate ? shortDayLabel(airDate, locale) : ''}
          </Text>
          <Text variant="meta" color={imminent ? 'accent/80' : 'textDim'}>
            {sentenceCase(relativeAirDate(airDate, locale), locale)}
          </Text>
        </Box>
      }
      link={
        <RouteLink
          to="/discover/$type/$tmdbId"
          params={{ type: entry.kind === 'show' ? 'tv' : 'movie', tmdbId: String(entry.tmdbId) }}
        />
      }
    />
  );
}

const s = styles({ heading: { m: 0 } });
