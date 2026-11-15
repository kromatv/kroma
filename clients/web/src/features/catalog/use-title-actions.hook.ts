import type { SubjectId } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import type { CommandActionDef } from '#web/shared/lib/command-menu';
import { useMyList } from '#web/shared/lib/mylist';
import { useWatched } from '#web/shared/lib/watched';

/** What the command menu can do to a title, as rows of their own or in a row's `actions`. */
export function useTitleActions(): Record<'list' | 'watched', (id: SubjectId) => CommandActionDef> {
  const t = useT();
  const { inList, toggle } = useMyList();
  const { isWatched, toggleWatched } = useWatched();

  return {
    list: (id) => ({
      ...(inList(id)
        ? {
            label: t('content.removeFromList'),
            icon: 'bookmark-off',
            done: t('content.removedFromList'),
          }
        : { label: t('content.addToList'), icon: 'bookmark', done: t('content.addedToList') }),
      run: () => toggle(id),
    }),
    watched: (id) => ({
      ...(isWatched(id)
        ? { label: t('content.markUnwatched'), icon: 'eye-off', done: t('content.markedUnwatched') }
        : { label: t('content.markWatched'), icon: 'eye', done: t('content.markedWatched') }),
      run: () => toggleWatched(id),
    }),
  };
}
