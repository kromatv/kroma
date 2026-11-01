import type { ItemId } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { useCommands } from '#web/shared/lib/command-menu';
import { useMyList } from '#web/shared/lib/mylist';
import { savedTitleId } from '#web/shared/lib/saved-title-id';
import type { TitleView } from '#web/shared/lib/titleView';
import { useWatched } from '#web/shared/lib/watched';

/** What a title's page offers the command menu while it is on screen. */
export function useTitleCommands(
  view: TitleView,
  owned: boolean,
  localId: string | null | undefined,
  play: (id: ItemId) => void,
): void {
  const t = useT();
  const { inList, toggle } = useMyList();
  const { isWatched, toggleWatched } = useWatched();
  const playable = owned ? view.playable : null;
  const listId = savedTitleId(view.kind, localId, view.tmdbId);
  const meta = view.title;

  useCommands([
    playable && {
      label: t('content.play'),
      icon: 'player-play',
      meta,
      run: () => play(playable.id),
    },
    listId && {
      label: inList(listId) ? t('content.removeFromList') : t('content.addToList'),
      icon: inList(listId) ? 'bookmark-off' : 'bookmark',
      meta,
      run: () => toggle(listId),
    },
    listId && {
      label: isWatched(listId) ? t('content.markUnwatched') : t('content.markWatched'),
      icon: isWatched(listId) ? 'eye-off' : 'eye',
      meta,
      run: () => toggleWatched(listId),
    },
  ]);
}
