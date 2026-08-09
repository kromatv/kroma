// One "Manquants" group card: the title header (poster, name, missing-count
// badge OR the movie's release line) and, for a series, its missing-episode
// rows. Long episode lists collapse behind a "show more" toggle so one gappy
// series can't swallow the page. The whole row is the selection control; the
// trailing button carries the row's busy and "search started" states. All
// mutation state lives in `missing.tsx`.

import { type CalendarEntry, episodeTag, posterColors, sizedImageUrl } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Badge, Button, Checkbox, CheckboxFace, Icon, IconButton, Spinner } from '@kroma/ui/kit';
import { useState } from 'react';
import { relativeAirDate } from '#web/features/requests/airdate';
import { epKey, type MissingGroup } from '#web/features/requests/missing-model';
import { Image } from '#web/shared/ui';

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
    <section className="overflow-hidden rounded-2xl border border-border bg-surface-1">
      <div className="flex items-center gap-3.5 border-b border-white/6 p-3.5 last:border-b-0">
        {canAct ? (
          <Checkbox
            checked={allPicked}
            indeterminate={pickedCount > 0 && !allPicked}
            onChange={onToggleGroup}
            label={t('requests.select')}
          />
        ) : (
          <span className="w-5" />
        )}
        <button
          type="button"
          onClick={onOpen}
          className="group/head flex min-w-0 flex-1 items-center gap-3.5 text-left"
        >
          <div
            className="relative h-[52px] w-[36px] flex-[0_0_36px] overflow-hidden rounded-md"
            style={{ background: `linear-gradient(158deg, ${c1}, ${c2})` }}
          >
            <Image src={poster} fit="cover" fill />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold transition-colors group-hover/head:text-accent">
              {group.title}
            </div>
            <GroupMeta group={group} episodeCount={episodes.length} />
          </div>
        </button>
        {canAct ? (
          <GroupSearchButton
            busy={groupBusy}
            done={groupDone}
            onPress={() => onSearch(group.items)}
          />
        ) : null}
      </div>
      <EpisodeList
        entries={episodes}
        canAct={canAct}
        busyKeys={busyKeys}
        doneKeys={doneKeys}
        selected={selected}
        onToggleRow={onToggleRow}
        onSearch={onSearch}
      />
    </section>
  );
}

function GroupMeta({
  group,
  episodeCount,
}: Readonly<{ group: MissingGroup; episodeCount: number }>) {
  const t = useT();
  const locale = useLocale();
  const movie = group.kind === 'movie';
  const rel = movie ? relativeAirDate(group.items[0]?.airDate ?? null, locale) : '';
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-semibold text-dim">
      <Badge tone="warning">
        {movie ? t('requests.missingMovie') : t('requests.missingCount', { count: episodeCount })}
      </Badge>
      {group.year ? <span>{group.year}</span> : null}
      {rel ? <span className="first-letter:uppercase">{rel}</span> : null}
    </div>
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
    <ul className="divide-y divide-white/4">
      {visible.map((e) => (
        <EpisodeRow
          key={epKey(e)}
          entry={e}
          canAct={canAct}
          busy={busyKeys.has(epKey(e))}
          done={doneKeys.has(epKey(e))}
          picked={selected.has(epKey(e))}
          onToggle={() => onToggleRow(epKey(e))}
          onSearch={() => onSearch([e])}
        />
      ))}
      {entries.length > COLLAPSE_OVER ? (
        <li className="px-1.5 py-1.5">
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
        </li>
      ) : null}
    </ul>
  );
}

function EpisodeRow({
  entry,
  canAct,
  busy,
  done,
  picked,
  onToggle,
  onSearch,
}: Readonly<{
  entry: CalendarEntry;
  canAct: boolean;
  busy: boolean;
  done: boolean;
  picked: boolean;
  onToggle: () => void;
  onSearch: () => void;
}>) {
  const cells = <EpisodeCells entry={entry} />;

  if (!canAct) {
    return <li className="flex items-center gap-3.5 py-2.5 pl-12 pr-3.5">{cells}</li>;
  }
  return (
    <li className="flex items-center transition-colors hover:bg-white/3">
      <button
        type="button"
        aria-pressed={picked}
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-3.5 py-2.5 pl-3.5 text-left"
      >
        <CheckboxFace checked={picked} />
        {cells}
      </button>
      <span className="px-2">
        <RowAction busy={busy} done={done} onSearch={onSearch} />
      </span>
    </li>
  );
}

function EpisodeCells({ entry }: Readonly<{ entry: CalendarEntry }>) {
  const t = useT();
  const locale = useLocale();
  const rel = relativeAirDate(entry.airDate, locale);
  return (
    <>
      <span className="w-[62px] flex-[0_0_62px] font-mono text-[13px] font-bold text-accent tabular-nums">
        {episodeTag(entry)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-dim">
        {rel ? (
          <span className="inline-block first-letter:uppercase">{rel}</span>
        ) : (
          <span className="italic text-white/35">{t('requests.noDate')}</span>
        )}
      </span>
    </>
  );
}

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
