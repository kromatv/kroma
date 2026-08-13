// "Bientôt disponible": the coming-soon calendar of upcoming, not-yet-available
// releases (a movie's availability date + a show episode's air date), grouped by
// month and ascending by date. Read-only view over GET /api/requests/calendar.
// Releases landing within the week get the accent date treatment so the
// imminent stuff pops out of the list.

import {
  type CalendarEntry,
  daysFromToday,
  episodeTag,
  monthKey,
  monthLabel,
  posterColors,
  relativeAirDate,
  sentenceCase,
  shortDayLabel,
  sizedImageUrl,
} from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Box, EmptyState, Icon, Img, ListRow, PageHeader, Row, Text } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { userQueries } from '#web/shared/lib/queries';
import { PAGE_MAIN, Skeleton } from '#web/shared/ui';

// Releases at most this many days out get the accent "imminent" date.
const IMMINENT_DAYS = 7;

export function ComingSoonPage() {
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
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
    <main className={PAGE_MAIN}>
      <PageHeader.Root>
        <PageHeader.Title>{t('requests.calendarTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('requests.calendarSubtitle')}</PageHeader.Subtitle>
      </PageHeader.Root>

      {isPending ? (
        <Box mt={24} gap={10}>
          {Array.from({ length: 5 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rows
            <Skeleton key={i} h={76} radius={16} />
          ))}
        </Box>
      ) : null}

      {entries?.length === 0 ? (
        <EmptyState.Root icon="calendar-clock">
          <EmptyState.Title>{t('requests.calendarEmpty')}</EmptyState.Title>
          <EmptyState.Hint>{t('requests.calendarEmptyHint')}</EmptyState.Hint>
        </EmptyState.Root>
      ) : null}

      {groups.map((g) => (
        <section key={g.key}>
          <h2 style={HEADING}>
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
                onOpen={() =>
                  navigate({
                    to: '/discover/$type/$tmdbId',
                    params: {
                      type: e.kind === 'show' ? 'tv' : 'movie',
                      tmdbId: String(e.tmdbId),
                    },
                  })
                }
              />
            ))}
          </Box>
        </section>
      ))}
    </main>
  );
}

function CalendarRow({
  entry,
  locale,
  onOpen,
}: Readonly<{ entry: CalendarEntry; locale: string; onOpen: () => void }>) {
  const t = useT();
  const [c1, c2] = posterColors(String(entry.tmdbId));
  const poster = sizedImageUrl(entry.posterUrl, 92);
  // `episodeTag` is empty for a movie (no season/episode numbering).
  const epTag = episodeTag(entry) || t('requests.movieLabel');
  const airDate = entry.airDate;
  // Bounded on BOTH sides: a row whose date has slipped into the past (a tab
  // left open past local midnight keeps stale rows) is not "imminent".
  const days = airDate != null ? daysFromToday(airDate) : null;
  const imminent = days != null && days >= 0 && days <= IMMINENT_DAYS;

  return (
    <ListRow.Root size="md" onPress={onOpen} chevron={false}>
      <ListRow.Leading>
        <Box w={40} h={60}>
          <Img src={poster} background={`linear-gradient(158deg, ${c1}, ${c2})`} radius="lg" fill />
        </Box>
      </ListRow.Leading>
      <ListRow.Label>{entry.title}</ListRow.Label>
      <Row gap={6} mt={2}>
        <Text variant="meta" color="accent">
          {epTag}
        </Text>
        {entry.year ? (
          <Text variant="meta" color="textDim">
            · {entry.year}
          </Text>
        ) : null}
        {entry.status === 'grabbed' ? (
          <Row gap={3}>
            <Text variant="meta" color="textDim">
              ·
            </Text>
            <Icon name="checks" size={13} thickness={2} color="success" />
            <Text variant="meta" color="success">
              {t('requests.securedShort')}
            </Text>
          </Row>
        ) : null}
      </Row>
      <ListRow.Trailing>
        <Box align="flex-end">
          <Text variant="label" color={imminent ? 'accent' : 'text'}>
            {airDate ? shortDayLabel(airDate, locale) : ''}
          </Text>
          <Text variant="meta" color={imminent ? 'accent/80' : 'textDim'}>
            {sentenceCase(relativeAirDate(airDate, locale), locale)}
          </Text>
        </Box>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

const HEADING = { margin: 0 } as const;
