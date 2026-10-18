import { hasPermission } from '@kromatv/client/accounts';
import type { CalendarEntry } from '@kromatv/client/requests';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  episodeRefs,
  epKey,
  isFollowed,
  type MissingGroup,
} from '#web/features/requests/missing-model';
import { useAuth } from '#web/shared/lib/auth';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** `search` queues what the server already wants, `follow` records the want,
 * `request` asks for it. */
export type GroupAction = 'search' | 'follow' | 'request' | 'none';

export interface MissingActions {
  selected: ReadonlySet<string>;
  busyKeys: ReadonlySet<string>;
  startedKeys: ReadonlySet<string>;
  selectedCount: number;
  canMonitor: boolean;
  selectedAction: GroupAction | 'mixed';
  actionOf: (group: MissingGroup) => GroupAction;
  toggleRow: (key: string) => void;
  toggleGroup: (group: MissingGroup, pick: boolean) => void;
  clearSelection: () => void;
  run: (group: MissingGroup, items: CalendarEntry[]) => void;
  runSelected: () => void;
}

const STARTED_MARK_MS = 30_000;

function withKeys(prev: ReadonlySet<string>, keys: string[], present: boolean): Set<string> {
  const next = new Set(prev);
  for (const key of keys) {
    if (present) next.add(key);
    else next.delete(key);
  }
  return next;
}

export function useMissingActions(groups: readonly MissingGroup[]): MissingActions {
  const webRuntime = useWebRuntime();
  const { user, client } = useAuth();
  const queryClient = useQueryClient();
  const { queryKey } = webRuntime.queries.userQueries.missing();
  const canMonitor = !!user && hasPermission(user, 'library.manage');
  const canManage = !!user && hasPermission(user, 'requests.manage');

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [startedKeys, setStartedKeys] = useState<ReadonlySet<string>>(() => new Set());

  const actionOf = (group: MissingGroup): GroupAction => {
    if (!isFollowed(group)) return canMonitor ? 'follow' : 'request';
    if (canMonitor) return 'search';
    return group.requestId !== null && canManage ? 'search' : 'none';
  };

  const search = async (group: MissingGroup, items: CalendarEntry[]) => {
    if (canMonitor) {
      const answer = await client.monitoring.search(group.kind, group.tmdbId, episodeRefs(items));
      return answer.started;
    }
    if (group.requestId === null) return false;
    await client.requests.autoSearch(group.requestId);
    return true;
  };

  const follow = async (group: MissingGroup, items: CalendarEntry[]) => {
    await client.monitoring.monitor(group.kind, group.tmdbId, { preset: 'none' });
    const episodes = episodeRefs(items);
    if (episodes.length === 0) return true;
    await client.monitoring.setEpisodes(group.tmdbId, {
      episodes: episodes.map((episode) => ({ ...episode, monitored: true })),
    });
    return true;
  };

  const ask = async (group: MissingGroup, items: CalendarEntry[]) => {
    await client.requests.create({
      kind: group.kind,
      tmdbId: group.tmdbId,
      seasons: null,
      episodes: episodeRefs(items),
    });
    return true;
  };

  const apply = async (group: MissingGroup, items: CalendarEntry[]): Promise<boolean> => {
    const action = actionOf(group);
    switch (action) {
      case 'search':
        return search(group, items);
      case 'follow':
        return follow(group, items);
      case 'request':
        return ask(group, items);
      case 'none':
        return false;
      default: {
        const unreached: never = action;
        return unreached;
      }
    }
  };

  const run = (group: MissingGroup, items: CalendarEntry[]) => {
    const keys = items.map(epKey);
    setBusyKeys((busy) => withKeys(busy, keys, true));
    apply(group, items)
      .then((went) => {
        if (!went) return;
        setStartedKeys((started) => withKeys(started, keys, true));
        setSelected((picked) => withKeys(picked, keys, false));
        setTimeout(
          () => setStartedKeys((started) => withKeys(started, keys, false)),
          STARTED_MARK_MS,
        );
      })
      .catch(() => undefined)
      .finally(() => {
        setBusyKeys((busy) => withKeys(busy, keys, false));
        void queryClient.invalidateQueries({ queryKey });
      });
  };

  const picked = groups.filter((group) => group.items.some((item) => selected.has(epKey(item))));
  const [verb, ...otherVerbs] = new Set(picked.map(actionOf));

  return {
    selected,
    busyKeys,
    startedKeys,
    selectedCount: selected.size,
    canMonitor,
    selectedAction: verb !== undefined && otherVerbs.length === 0 ? verb : 'mixed',
    actionOf,
    toggleRow: (key) => setSelected((picked) => withKeys(picked, [key], !picked.has(key))),
    toggleGroup: (group, pick) =>
      setSelected((picked) => withKeys(picked, group.items.map(epKey), pick)),
    clearSelection: () => setSelected(new Set()),
    run,
    runSelected: () => {
      for (const group of groups) {
        const picked = group.items.filter((item) => selected.has(epKey(item)));
        if (picked.length > 0) run(group, picked);
      }
    },
  };
}
