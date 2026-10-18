import { tmdbKindOf } from '@kromatv/client/discovery';
import type { CalendarEntry } from '@kromatv/client/requests';
import {
  daysFromToday,
  episodeTag,
  monthKey,
  monthLabel,
  relativeAirDate,
  sentenceCase,
  shortDayLabel,
} from '@kromatv/core';
import { useLocale, useT } from '@kromatv/ui';
import { Box, classes, EmptyState, Icon, Row, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { RequestCard, RequestCardSkeleton } from '#web/shared/ui/request-card';
import { RouteLink } from '#web/shared/ui/route-link';

const IMMINENT_DAYS = 7;

/** What is due to land, grouped by month: the reader's requests, and for a
 *  library manager the titles the server follows too. */
export function UpcomingList() {
  const webRuntime = useWebRuntime();
  const s = useStyles(sDefinition);
  const t = useT();
  const locale = useLocale();
  const { data: entries, isPending } = useQuery({
    ...webRuntime.queries.userQueries.calendar(),
    refetchInterval: 60_000,
  });

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
    <>
      {isPending ? <RequestCardSkeleton rows={5} /> : null}

      {entries?.length === 0 ? (
        <EmptyState.Root icon="calendar-clock">
          <EmptyState.Title>{t('requests.calendarEmpty')}</EmptyState.Title>
        </EmptyState.Root>
      ) : null}
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className={classes(s.heading)}>
            <Text variant="overline" color="textDim" mt={28} mb={10}>
              {g.label}
            </Text>
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
    </>
  );
}

function CalendarRow({ entry, locale }: Readonly<{ entry: CalendarEntry; locale: string }>) {
  const t = useT();
  const epTag = episodeTag(entry) || t('requests.movieLabel');
  const airDate = entry.airDate;
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
          params={{ type: tmdbKindOf(entry.kind), tmdbId: String(entry.tmdbId) }}
        />
      }
    />
  );
}

const sDefinition = styles({ heading: { m: 0 } });
