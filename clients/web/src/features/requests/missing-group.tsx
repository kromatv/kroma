import type { CalendarEntry } from '@kromatv/client/requests';
import { relativeAirDate, sentenceCase } from '@kromatv/core';
import { useLocale, useT } from '@kromatv/ui';
import { Badge, Button, Checkbox, Divider, Row, Text } from '@kromatv/ui/kit';
import { EpisodeList } from '#web/features/requests/missing-episodes';
import { epKey, isFollowed, type MissingGroup } from '#web/features/requests/missing-model';
import { RequestCard } from '#web/features/requests/request-card';
import type { GroupAction } from '#web/features/requests/use-missing-actions';
import { RouteLink } from '#web/shared/ui/route-link';

const GROUP_ACTION = {
  search: { icon: 'search', key: 'requests.searchNow', started: 'requests.searchStarted' },
  follow: { icon: 'radar', key: 'requests.followEpisodes', started: 'monitoring.action' },
  request: { icon: 'plus', key: 'requests.askEpisodes', started: 'requests.asked' },
} as const;

function episodesOf(group: MissingGroup): CalendarEntry[] {
  if (group.kind === 'movie') return [];
  return group.items.filter((i) => i.season != null && i.episode != null);
}

export function MissingGroupCard({
  group,
  action,
  canMonitor,
  busyKeys,
  startedKeys,
  selected,
  onToggleRow,
  onToggleGroup,
  onRun,
}: Readonly<{
  group: MissingGroup;
  action: GroupAction;
  canMonitor: boolean;
  busyKeys: ReadonlySet<string>;
  startedKeys: ReadonlySet<string>;
  selected: ReadonlySet<string>;
  onToggleRow: (key: string) => void;
  onToggleGroup: (pick: boolean) => void;
  onRun: (items: CalendarEntry[]) => void;
}>) {
  const t = useT();
  const locale = useLocale();

  const episodes = episodesOf(group);
  const keys = group.items.map(epKey);
  const groupBusy = keys.some((k) => busyKeys.has(k));
  const groupStarted = !groupBusy && keys.every((k) => startedKeys.has(k));
  const pickedCount = keys.filter((k) => selected.has(k)).length;
  const allPicked = keys.length > 0 && pickedCount === keys.length;

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
        <Row gap={8} align="center" wrap mt={4}>
          <Text variant="meta" color="textDim">
            {[group.year ? String(group.year) : '', rel ? sentenceCase(rel, locale) : '']
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Badge tone="warning">{gap}</Badge>
        </Row>
      }
      leading={
        action === 'none' ? null : (
          <Checkbox
            checked={allPicked}
            indeterminate={pickedCount > 0 && !allPicked}
            onCheckedChange={onToggleGroup}
            label={t('requests.selectUnit', { item: group.title })}
          />
        )
      }
      aside={
        <Row gap={8} justify="flex-end">
          <GroupActionButton
            action={action}
            busy={groupBusy}
            started={groupStarted}
            onPress={() => onRun(group.items)}
          />
          {isFollowed(group) && canMonitor ? (
            <Button variant="glass" size="sm" icon="radar" label={t('monitoring.manage')} asChild>
              <RouteLink
                to="/admin/monitoring/$kind/$tmdbId"
                params={{ kind: group.kind, tmdbId: String(group.tmdbId) }}
              />
            </Button>
          ) : null}
        </Row>
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
        title={group.title}
        action={action}
        busyKeys={busyKeys}
        startedKeys={startedKeys}
        selected={selected}
        onToggleRow={onToggleRow}
        onRun={onRun}
      />
    </RequestCard>
  );
}

function GroupActionButton({
  action,
  busy,
  started,
  onPress,
}: Readonly<{ action: GroupAction; busy: boolean; started: boolean; onPress: () => void }>) {
  const t = useT();
  if (action === 'none') return null;
  const { icon, key, started: startedKey } = GROUP_ACTION[action];
  if (started) {
    return <Button variant="glass" size="sm" icon="check" label={t(startedKey)} disabled />;
  }
  return (
    <Button variant="glass" size="sm" icon={icon} label={t(key)} onPress={onPress} loading={busy} />
  );
}
