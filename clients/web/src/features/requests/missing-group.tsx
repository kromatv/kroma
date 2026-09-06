// One "Manquants" group card: the title header (poster, name, missing-count
// badge OR the movie's release line) and, for a series, its missing-episode
// rows. Long episode lists collapse behind a "show more" toggle so one gappy
// series can't swallow the page. The whole row is the selection control; the
// trailing button carries the row's busy and "search started" states. All
// mutation state lives in `missing.tsx`.

import type { CalendarEntry } from '@kroma/client/requests';
import { relativeAirDate, sentenceCase } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Badge, Box, Button, Checkbox, Divider, Text } from '@kroma/ui/kit';
import { EpisodeList } from '#web/features/requests/missing-episodes';
import { epKey, type MissingGroup } from '#web/features/requests/missing-model';
import { RequestCard } from '#web/features/requests/request-card';
import { RouteLink } from '#web/shared/ui/route-link';

function episodesOf(group: MissingGroup): CalendarEntry[] {
  if (group.kind === 'movie') return [];
  return group.items.filter((i) => i.season != null && i.episode != null);
}

export function MissingGroupCard({
  group,
  canManage,
  busyKeys,
  doneKeys,
  selected,
  onToggleRow,
  onToggleGroup,
  onSearch,
}: Readonly<{
  group: MissingGroup;
  canManage: boolean;
  busyKeys: Set<string>;
  doneKeys: Set<string>;
  selected: Set<string>;
  onToggleRow: (key: string) => void;
  onToggleGroup: (pick: boolean) => void;
  onSearch: (items: CalendarEntry[]) => void;
}>) {
  const t = useT();
  const locale = useLocale();

  const episodes = episodesOf(group);
  const keys = group.items.map(epKey);
  const groupBusy = keys.some((k) => busyKeys.has(k));
  const groupDone = !groupBusy && keys.every((k) => doneKeys.has(k));
  const pickedCount = keys.filter((k) => selected.has(k)).length;
  const allPicked = keys.length > 0 && pickedCount === keys.length;
  // A gap is actionable by any requester; a request needs manage.
  const canAct = group.requestId ? canManage : true;

  const movie = group.kind === 'movie';
  const rel = movie ? relativeAirDate(group.items[0]?.airDate ?? null, locale) : '';
  const gap = movie
    ? t('requests.missingMovie')
    : t('requests.missingCount', { count: episodes.length });

  return (
    <RequestCard
      label={`${group.title} · ${gap}`}
      tmdbId={group.tmdbId}
      posterUrl={group.posterUrl}
      title={group.title}
      meta={
        <Text variant="meta" color="textDim" mt={2}>
          {[group.year ? String(group.year) : '', rel ? sentenceCase(rel, locale) : '']
            .filter(Boolean)
            .join(' · ')}
        </Text>
      }
      trailing={<Badge tone="warning">{gap}</Badge>}
      leading={
        canAct ? (
          <Checkbox
            checked={allPicked}
            indeterminate={pickedCount > 0 && !allPicked}
            onCheckedChange={onToggleGroup}
            label={t('requests.select')}
          />
        ) : (
          <Box w={20} />
        )
      }
      aside={
        canAct ? (
          <GroupSearchButton
            busy={groupBusy}
            done={groupDone}
            onPress={() => onSearch(group.items)}
          />
        ) : null
      }
      link={
        <RouteLink
          to="/discover/$type/$tmdbId"
          params={{ type: movie ? 'movie' : 'tv', tmdbId: String(group.tmdbId) }}
        />
      }
    >
      {episodes.length > 0 ? <Divider color="tint/6" /> : null}
      <EpisodeList
        entries={episodes}
        canAct={canAct}
        busyKeys={busyKeys}
        doneKeys={doneKeys}
        selected={selected}
        onToggleRow={onToggleRow}
        onSearch={onSearch}
      />
    </RequestCard>
  );
}

function GroupSearchButton({
  busy,
  done,
  onPress,
}: Readonly<{ busy: boolean; done: boolean; onPress: () => void }>) {
  const t = useT();
  if (done) {
    return (
      <Button variant="glass" size="sm" icon="check" label={t('requests.searchStarted')} disabled />
    );
  }
  return (
    <Button
      variant="glass"
      size="sm"
      icon="search"
      label={t('requests.search')}
      onPress={onPress}
      loading={busy}
    />
  );
}
