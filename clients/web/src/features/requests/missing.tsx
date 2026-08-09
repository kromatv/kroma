// "Manquants" (Wanted / Missing), modeled on Sonarr's Wanted > Missing: episode-
// level rows grouped under their series (or a single movie row), each with its
// air date (relative) and a search action, plus row/series checkboxes driving a
// "search selected" toolbar and a "search all". A library-scan gap (no request
// yet) becomes a request on search ("ask to watch"); a requested title just
// re-runs its grab. The group card itself lives in `missing-group.tsx`.

import { type CalendarEntry, hasPermission } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, EmptyState, IconButton, PageHeader } from '@kroma/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { MissingGroupCard } from '#web/features/requests/missing-group';
import { epKey, groupByTitle, type MissingGroup } from '#web/features/requests/missing-model';
import { useAuth } from '#web/shared/lib/auth';
import { userQueries } from '#web/shared/lib/queries';
import { PAGE_MAIN, Skeleton } from '#web/shared/ui';

function toggleKey(prev: Set<string>, key: string): Set<string> {
  const n = new Set(prev);
  if (n.has(key)) n.delete(key);
  else n.add(key);
  return n;
}

function toggleKeys(prev: Set<string>, keys: string[], pick: boolean): Set<string> {
  const n = new Set(prev);
  for (const k of keys) {
    if (pick) n.add(k);
    else n.delete(k);
  }
  return n;
}

// The grabs run server-side, so "done" only means the batch was started.
type SearchAllState = 'idle' | 'busy' | 'done';

// How long a row wears its "search started" mark: long enough for the refetch
// to drop a grabbed row, then back to searchable so a fruitless pass can rerun.
const DONE_DECAY_MS = 30_000;

export function MissingPage() {
  const t = useT();
  const navigate = useNavigate();
  const { user, client } = useAuth();
  const queryClient = useQueryClient();
  const query = userQueries.missing();
  const { data: entries, isPending } = useQuery({ ...query, refetchInterval: 30_000 });
  const canManage = !!user && hasPermission(user, 'requests.manage');

  const groups = useMemo(() => groupByTitle(entries ?? []), [entries]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());
  const [searchAll, setSearchAll] = useState<SearchAllState>('idle');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: query.queryKey });

  // Acquire a subset of one group's episodes: a requested title re-runs its grab;
  // a library gap becomes a request for those episodes, then (if we can) grabs.
  const acquire = async (g: MissingGroup, items: CalendarEntry[]) => {
    if (g.requestId) {
      await client.autoSearchRequest(g.requestId);
      return;
    }
    const episodes = items
      .filter((i) => i.season != null && i.episode != null)
      .map((i) => ({ season: i.season as number, episode: i.episode as number }));
    const req = await client.createRequest({
      kind: 'show',
      tmdbId: g.tmdbId,
      seasons: null,
      episodes,
    });
    if (canManage) await client.autoSearchRequest(req.id);
  };

  const runGroup = (g: MissingGroup, items: CalendarEntry[]) => {
    const keys = items.map(epKey);
    setBusyKeys((b) => toggleKeys(b, keys, true));
    acquire(g, items)
      .then(() => {
        setDoneKeys((d) => toggleKeys(d, keys, true));
        // Only rows whose search started leave the selection; a failed batch
        // stays picked so it can be retried in one press.
        setSelected((s) => toggleKeys(s, keys, false));
        setTimeout(() => setDoneKeys((d) => toggleKeys(d, keys, false)), DONE_DECAY_MS);
      })
      .catch(() => undefined)
      .finally(() => {
        setBusyKeys((b) => toggleKeys(b, keys, false));
        invalidate();
      });
  };

  const searchSelected = () => {
    for (const g of groups) {
      const picked = g.items.filter((i) => selected.has(epKey(i)));
      if (picked.length > 0) runGroup(g, picked);
    }
  };

  const onSearchAll = () => {
    setSearchAll('busy');
    client
      .searchAllMissing()
      .then(() => {
        setSearchAll('done');
        setTimeout(invalidate, 4000);
      })
      .catch(() => setSearchAll('idle'));
  };

  return (
    <main className={PAGE_MAIN}>
      <PageHeader
        title={t('requests.missingTitle')}
        suffix={entries && entries.length > 0 ? String(entries.length) : undefined}
        subtitle={t('requests.missingSubtitle')}
        action={
          groups.length > 0 && (canManage || selected.size > 0) ? (
            <MissingActions
              canManage={canManage}
              selectedCount={selected.size}
              searchAll={searchAll}
              onSearchSelected={searchSelected}
              onClearSelection={() => setSelected(new Set())}
              onSearchAll={onSearchAll}
            />
          ) : undefined
        }
      />

      {isPending ? <MissingSkeleton /> : null}

      {entries?.length === 0 ? (
        <EmptyState
          icon="circle-check"
          title={t('requests.missingEmpty')}
          hint={t('requests.missingEmptyHint')}
          action={
            <Button
              variant="glass"
              size="sm"
              icon="search"
              label={t('requests.myEmptyCta')}
              onPress={() => navigate({ to: '/search' })}
            />
          }
        />
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        {groups.map((g) => (
          <MissingGroupCard
            key={g.requestId ?? `tmdb:${g.tmdbId}`}
            group={g}
            canManage={canManage}
            busyKeys={busyKeys}
            doneKeys={doneKeys}
            selected={selected}
            onToggleRow={(key) => setSelected((s) => toggleKey(s, key))}
            onToggleGroup={(pick) => setSelected((s) => toggleKeys(s, g.items.map(epKey), pick))}
            onSearch={(items) => runGroup(g, items)}
            onOpen={() =>
              navigate({
                to: '/discover/$type/$tmdbId',
                params: {
                  type: g.kind === 'movie' ? 'movie' : 'tv',
                  tmdbId: String(g.tmdbId),
                },
              })
            }
          />
        ))}
      </div>
    </main>
  );
}

function MissingActions({
  canManage,
  selectedCount,
  searchAll,
  onSearchSelected,
  onClearSelection,
  onSearchAll,
}: Readonly<{
  canManage: boolean;
  selectedCount: number;
  searchAll: SearchAllState;
  onSearchSelected: () => void;
  onClearSelection: () => void;
  onSearchAll: () => void;
}>) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {selectedCount > 0 ? (
        <>
          <Button
            variant="outline"
            active
            size="sm"
            icon="search"
            label={t('requests.searchSelected', { count: selectedCount })}
            onPress={onSearchSelected}
          />
          <IconButton
            variant="ghost"
            control="sm"
            icon="x"
            label={t('common.clear')}
            onPress={onClearSelection}
          />
        </>
      ) : null}
      {canManage ? <SearchAllButton state={searchAll} onClick={onSearchAll} /> : null}
    </div>
  );
}

function SearchAllButton({
  state,
  onClick,
}: Readonly<{ state: SearchAllState; onClick: () => void }>) {
  const t = useT();
  return (
    <Button
      size="sm"
      icon={state === 'done' ? 'check' : 'search'}
      label={t(state === 'done' ? 'requests.searchStarted' : 'requests.searchAll')}
      onPress={onClick}
      loading={state === 'busy'}
      disabled={state === 'done'}
    />
  );
}

const SKELETON_ROWS = [3, 2, 4];

function MissingSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-3" aria-busy="true">
      {SKELETON_ROWS.map((rows, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder cards
        <GroupSkeleton key={i} rows={rows} />
      ))}
    </div>
  );
}

function GroupSkeleton({ rows }: Readonly<{ rows: number }>) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-1">
      <div className="flex items-center gap-3.5 border-b border-white/6 p-3.5">
        <Skeleton w={20} h={20} radius="sm" />
        <Skeleton w={36} h={52} radius="sm" />
        <div className="min-w-0 flex-1">
          <Skeleton shape="text" lines={2} variant="meta" maxW={220} />
        </div>
        <Skeleton w={110} h={40} radius="md" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rows
        <div key={i} className="flex items-center gap-3.5 px-3.5 py-3.5">
          <Skeleton w={20} h={20} radius="sm" />
          <Skeleton w={62} h={12} radius="pill" />
          <Skeleton w="28%" h={12} radius="pill" />
        </div>
      ))}
    </div>
  );
}
