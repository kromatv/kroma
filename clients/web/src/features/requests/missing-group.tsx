// One "Manquants" group card: the title header (poster, name, missing-count
// badge OR the movie's release line) and, for a series, its missing-episode
// rows. Long episode lists collapse behind a "show more" toggle so one gappy
// series can't swallow the page. The whole row is the selection control; the
// trailing button carries the row's busy and "search started" states. All
// mutation state lives in `missing.tsx`.

import {
  type CalendarEntry,
  posterColors,
  relativeAirDate,
  sentenceCase,
  sizedImageUrl,
} from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Focusable,
  Img,
  Row,
  Surface,
  styles,
  Text,
} from '@kroma/ui/kit';
import { EpisodeList } from '#web/features/requests/missing-episodes';
import { epKey, type MissingGroup } from '#web/features/requests/missing-model';

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
  onOpen,
}: Readonly<{
  group: MissingGroup;
  canManage: boolean;
  busyKeys: Set<string>;
  doneKeys: Set<string>;
  selected: Set<string>;
  onToggleRow: (key: string) => void;
  onToggleGroup: (pick: boolean) => void;
  onSearch: (items: CalendarEntry[]) => void;
  onOpen: () => void;
}>) {
  const t = useT();
  const [c1, c2] = posterColors(String(group.tmdbId));
  const poster = sizedImageUrl(group.posterUrl, 92);

  const episodes = episodesOf(group);
  const keys = group.items.map(epKey);
  const groupBusy = keys.some((k) => busyKeys.has(k));
  const groupDone = !groupBusy && keys.every((k) => doneKeys.has(k));
  const pickedCount = keys.filter((k) => selected.has(k)).length;
  const allPicked = keys.length > 0 && pickedCount === keys.length;
  // A gap is actionable by any requester; a request needs manage.
  const canAct = group.requestId ? canManage : true;

  return (
    <Surface pad="none" radius="2xl" border="border" overflow="hidden" role="region">
      <Row gap={14} p={14}>
        {canAct ? (
          <Checkbox
            checked={allPicked}
            indeterminate={pickedCount > 0 && !allPicked}
            onCheckedChange={onToggleGroup}
            label={t('requests.select')}
          />
        ) : (
          <Box w={20} />
        )}
        <Focusable onPress={onOpen} label={group.title} style={s.head}>
          {(state) => (
            <>
              <Box w={36} h={52} shrink={0}>
                <Img
                  src={poster}
                  background={`linear-gradient(158deg, ${c1}, ${c2})`}
                  radius="md"
                  fill
                />
              </Box>
              <Box minW={0} shrink={1}>
                <Text variant="label" lines={1} color={state.hovered ? 'accent' : 'text'}>
                  {group.title}
                </Text>
                <GroupMeta group={group} episodeCount={episodes.length} />
              </Box>
            </>
          )}
        </Focusable>
        {canAct ? (
          <GroupSearchButton
            busy={groupBusy}
            done={groupDone}
            onPress={() => onSearch(group.items)}
          />
        ) : null}
      </Row>
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
    </Surface>
  );
}

const s = styles({
  head: { row: true, align: 'center', gap: 14, flex: true, minW: 0 },
});

function GroupMeta({
  group,
  episodeCount,
}: Readonly<{ group: MissingGroup; episodeCount: number }>) {
  const t = useT();
  const locale = useLocale();
  const movie = group.kind === 'movie';
  const rel = movie ? relativeAirDate(group.items[0]?.airDate ?? null, locale) : '';
  return (
    <Row wrap gapX={8} gapY={4} mt={4}>
      <Badge tone="warning">
        {movie ? t('requests.missingMovie') : t('requests.missingCount', { count: episodeCount })}
      </Badge>
      {group.year ? (
        <Text variant="meta" color="textDim">
          {group.year}
        </Text>
      ) : null}
      {rel ? (
        <Text variant="meta" color="textDim">
          {sentenceCase(rel, locale)}
        </Text>
      ) : null}
    </Row>
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
