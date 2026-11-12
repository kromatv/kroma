import type { ItemId } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { useTitleActions } from '#web/features/catalog/use-title-actions';
import { useCommands } from '#web/shared/lib/command-menu';
import { savedTitleId } from '#web/shared/lib/saved-title-id';
import type { TitleView } from '#web/shared/lib/titleView';

/** What a title's page offers the command menu while it is on screen. */
export function useTitleCommands(view: TitleView, play: (id: ItemId) => void): void {
  const t = useT();
  const { list, watched } = useTitleActions();
  const playable = view.localId == null ? null : view.playable;
  const id = savedTitleId(view.kind, view.localId, view.tmdbId);

  useCommands(
    [
      playable && { label: t('content.play'), icon: 'player-play', run: () => play(playable.id) },
      id && list(id),
      id && watched(id),
    ],
    { meta: view.title },
  );
}
