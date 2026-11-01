import type { SearchHit, Show, SubjectId } from '@kromatv/client/media';
import { episodeTag, formatRuntime } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { matchText } from '@kromatv/ui/kit';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { EPISODES_ANCHOR } from '#web/shared/lib/show-search';
import { useAuth } from '#web/shared/lib/auth';
import {
  type CommandActionDef,
  type CommandDef,
  useCommandQuery,
  useCommands,
} from '#web/shared/lib/command-menu';
import { useMyList } from '#web/shared/lib/mylist';
import { useDebouncedValue } from '#web/shared/lib/use-debounced-value';
import { useWatched } from '#web/shared/lib/watched';

const DEBOUNCE_MS = 180;
const MIN_LENGTH = 2;
const LIMIT = 6;
const POSTER_WIDTH = 60;
const SHORTEST_RUNTIME_MS = 30_000;

interface TitleContext {
  group: string;
  t: ReturnType<typeof useT>;
  artwork: ReturnType<typeof useAuth>['client']['media']['artwork'];
  isWatched: (id: SubjectId) => boolean;
  toggleWatched: (id: SubjectId) => void;
  inList: (id: SubjectId) => boolean;
  toggleList: (id: SubjectId) => void;
}

const line = (...parts: readonly (string | null | undefined)[]) =>
  parts.filter(Boolean).join(' · ');

function yearOf({ year, metadata }: Pick<Show, 'year' | 'metadata'>): string | undefined {
  return year?.toString() ?? metadata?.releaseDate?.slice(0, 4);
}

function watchedAction(id: SubjectId, context: TitleContext): CommandActionDef {
  const { t, isWatched, toggleWatched } = context;
  const seen = isWatched(id);
  return {
    label: t(seen ? 'content.markUnwatched' : 'content.markWatched'),
    icon: seen ? 'eye-off' : 'eye',
    done: t(seen ? 'commands.markedUnwatched' : 'commands.markedWatched'),
    run: () => toggleWatched(id),
  };
}

function listAction(id: SubjectId, context: TitleContext): CommandActionDef {
  const { t, inList, toggleList } = context;
  const listed = inList(id);
  return {
    label: t(listed ? 'content.removeFromList' : 'content.addToList'),
    icon: listed ? 'bookmark-off' : 'bookmark',
    done: t(listed ? 'commands.removedFromList' : 'commands.addedToList'),
    run: () => toggleList(id),
  };
}

function titleCommand(hit: SearchHit, context: TitleContext): CommandDef {
  const { group, t, artwork, isWatched } = context;
  const shared = { group, primaryLabel: t('commands.actionOpenTitle') };
  const seen = (id: SubjectId) => (isWatched(id) ? t('content.watched') : undefined);

  if (hit.type === 'show') {
    const { show } = hit;
    return {
      ...shared,
      id: `title:${show.id}`,
      label: show.title,
      subtitle: line(
        t('content.series'),
        yearOf(show),
        t('content.seasonCount', { count: show.seasonCount }),
      ),
      meta: seen(show.id),
      icon: 'device-tv',
      image: artwork.showPosterFor(show, POSTER_WIDTH),
      to: '/shows/$id',
      params: { id: show.id },
      actions: [listAction(show.id, context), watchedAction(show.id, context)],
    };
  }

  const { item } = hit;
  const play: CommandActionDef = {
    label: t('content.play'),
    icon: 'player-play',
    to: '/watch/$id',
    params: { id: item.id },
  };
  const common = {
    ...shared,
    id: `title:${item.id}`,
    meta: seen(item.id),
    image: artwork.posterFor(item, POSTER_WIDTH),
  };
  if (hit.type === 'episode') {
    return {
      ...common,
      label: item.episodeTitle ?? item.title,
      subtitle: line(item.showTitle, episodeTag(item)),
      icon: 'device-tv',
      actions: [play, watchedAction(item.id, context)],
      ...(item.showId
        ? {
            primaryLabel: t('commands.actionOpenShow'),
            to: '/shows/$id',
            params: { id: item.showId },
            search: item.season === null ? undefined : { season: item.season },
            hash: EPISODES_ANCHOR,
          }
        : { to: '/movies/$id', params: { id: item.id } }),
    };
  }
  return {
    ...common,
    label: item.title,
    subtitle: line(
      item.kind === 'movie' ? t('content.film') : null,
      yearOf(item),
      (item.durationMs ?? 0) >= SHORTEST_RUNTIME_MS ? formatRuntime(item.durationMs) : null,
    ),
    icon: 'movie',
    to: '/movies/$id',
    params: { id: item.id },
    actions: [play, listAction(item.id, context), watchedAction(item.id, context)],
  };
}

/** The library's titles that answer what is typed in the command menu, then the way
 *  out to the search page, which also reaches what is not in the library yet. The server
 *  searches casts and synopses and forgives typos, and answers loosely. So when some
 *  titles are named what was typed, the loose ones are noise and have to match to stay,
 *  and when none are, it knows something the menu cannot see and all of them stay. */
export function useLibrarySearchCommands(): void {
  const t = useT();
  const { client } = useAuth();
  const { isWatched, toggleWatched } = useWatched();
  const { inList, toggle: toggleList } = useMyList();
  const typed = useCommandQuery().trim();
  const settled = useDebouncedValue(typed, DEBOUNCE_MS);
  const { data = [] } = useQuery({
    queryKey: ['commandMenu', 'titles', settled],
    enabled: settled.length >= MIN_LENGTH,
    placeholderData: keepPreviousData,
    queryFn: async () => (await client.media.search(settled, { limit: LIMIT })).results,
  });
  const context: TitleContext = {
    group: t('commands.groupTitles'),
    t,
    artwork: client.media.artwork,
    isWatched,
    toggleWatched,
    inList,
    toggleList,
  };

  const rows = typed.length >= MIN_LENGTH ? data.map((hit) => titleCommand(hit, context)) : [];
  const named = rows.some((row) => matchText(row.label, typed) !== null);

  useCommands([
    ...rows.map((row) => ({ ...row, always: !named })),
    typed && {
      label: t('commands.searchEverywhere'),
      group: t('nav.search'),
      icon: 'search',
      meta: typed,
      always: true,
      primaryLabel: t('commands.actionSeeResults'),
      to: '/search',
      search: { q: typed, type: 'all' },
    },
  ]);
}
