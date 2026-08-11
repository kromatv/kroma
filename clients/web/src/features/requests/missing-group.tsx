// One "Manquants" group card: the title header (poster, name, missing-count
// badge OR the movie's release line) and, for a series, its missing-episode
// rows. Long episode lists collapse behind a "show more" toggle so one gappy
// series can't swallow the page. The whole row is the selection control; the
// trailing button carries the row's busy and "search started" states. All
// mutation state lives in `missing.tsx`.

import { type CalendarEntry, episodeTag, posterColors, sizedImageUrl } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import {
  Badge,
  Box,
  Button,
  Checkbox,
  CheckboxFace,
  Divider,
  Focusable,
  Icon,
  IconButton,
  Img,
  Row,
  Spinner,
  Surface,
  styles,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { relativeAirDate, sentenceCase } from '#web/features/requests/airdate';
import { epKey, type MissingGroup } from '#web/features/requests/missing-model';

// Episode lists longer than this collapse behind a "show more" toggle.
const COLLAPSE_OVER = 12;
// How many rows a collapsed list keeps visible.
const COLLAPSED_ROWS = 10;

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
            onChange={onToggleGroup}
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
  episode: { row: true, align: 'center', gap: 14, flex: true, minW: 0, py: 10, pl: 14 },
  tag: { w: 62, shrink: 0, fontWeight: '700', fontVariant: ['tabular-nums'] },
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

function EpisodeList({
  entries,
  canAct,
  busyKeys,
  doneKeys,
  selected,
  onToggleRow,
  onSearch,
}: Readonly<{
  entries: CalendarEntry[];
  canAct: boolean;
  busyKeys: Set<string>;
  doneKeys: Set<string>;
  selected: Set<string>;
  onToggleRow: (key: string) => void;
  onSearch: (items: CalendarEntry[]) => void;
}>) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;

  const collapsed = !expanded && entries.length > COLLAPSE_OVER;
  const visible = collapsed ? entries.slice(0, COLLAPSED_ROWS) : entries;
  return (
    <ul style={LIST}>
      {visible.map((e, index) => (
        <EpisodeRow
          key={epKey(e)}
          entry={e}
          ruled={index > 0}
          canAct={canAct}
          busy={busyKeys.has(epKey(e))}
          done={doneKeys.has(epKey(e))}
          picked={selected.has(epKey(e))}
          onToggle={() => onToggleRow(epKey(e))}
          onSearch={() => onSearch([e])}
        />
      ))}
      {entries.length > COLLAPSE_OVER ? (
        <li style={LIST_ITEM}>
          <Divider color="tint/4" />
          <Box px={6} py={6} self="flex-start">
            <Button
              variant="ghost"
              size="sm"
              iconRight={collapsed ? 'chevron-down' : 'chevron-up'}
              label={
                collapsed
                  ? t('requests.showMore', { count: entries.length - COLLAPSED_ROWS })
                  : t('requests.showLess')
              }
              onPress={() => setExpanded((v) => !v)}
            />
          </Box>
        </li>
      ) : null}
    </ul>
  );
}

const LIST = { margin: 0, padding: 0, listStyle: 'none' } as const;

const LIST_ITEM = { display: 'block' } as const;

function EpisodeRow({
  entry,
  ruled,
  canAct,
  busy,
  done,
  picked,
  onToggle,
  onSearch,
}: Readonly<{
  entry: CalendarEntry;
  ruled: boolean;
  canAct: boolean;
  busy: boolean;
  done: boolean;
  picked: boolean;
  onToggle: () => void;
  onSearch: () => void;
}>) {
  const cells = <EpisodeCells entry={entry} />;
  const rule = ruled ? <Divider color="tint/4" /> : null;

  if (!canAct) {
    return (
      <li style={LIST_ITEM}>
        {rule}
        <Row gap={14} py={10} pl={48} pr={14}>
          {cells}
        </Row>
      </li>
    );
  }
  return (
    <li style={LIST_ITEM}>
      {rule}
      <Row minW={0}>
        <Focusable
          role="checkbox"
          checked={picked}
          onPress={onToggle}
          label={episodeTag(entry)}
          style={s.episode}
        >
          <CheckboxFace checked={picked} />
          {cells}
        </Focusable>
        <Box px={8} justify="center">
          <RowAction busy={busy} done={done} onSearch={onSearch} />
        </Box>
      </Row>
    </li>
  );
}

function EpisodeCells({ entry }: Readonly<{ entry: CalendarEntry }>) {
  const t = useT();
  const locale = useLocale();
  const rel = relativeAirDate(entry.airDate, locale);
  return (
    <>
      <Text variant="meta" font="mono" color="accent" style={s.tag}>
        {episodeTag(entry)}
      </Text>
      {rel ? (
        <Text variant="meta" color="textDim" lines={1} flex minW={0}>
          {sentenceCase(rel, locale)}
        </Text>
      ) : (
        <Text variant="meta" color="white/35" lines={1} flex minW={0} style={ITALIC}>
          {t('requests.noDate')}
        </Text>
      )}
    </>
  );
}

const ITALIC = { fontStyle: 'italic' } as const;

function RowAction({
  busy,
  done,
  onSearch,
}: Readonly<{ busy: boolean; done: boolean; onSearch: () => void }>) {
  const t = useT();
  if (done) {
    return (
      <IconButton variant="ghost" control="sm" label={t('requests.searchStarted')} disabled>
        <Icon name="check" size={16} color="success" />
      </IconButton>
    );
  }
  return (
    <IconButton
      variant="ghost"
      control="sm"
      icon="search"
      label={t('requests.searchTitle')}
      onPress={onSearch}
      disabled={busy}
    >
      {busy ? <Spinner size={15} /> : null}
    </IconButton>
  );
}
