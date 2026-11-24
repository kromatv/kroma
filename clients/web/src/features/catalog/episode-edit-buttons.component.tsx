import { hasPermission } from '@kromatv/client/accounts';
import type { MediaItem } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { IconButton } from '@kromatv/ui/kit';

import { ArtworkDialog } from '#web/features/catalog/artwork-dialog.component';
import { TitleInfoDialog } from '#web/features/catalog/title-info-dialog.component';
import { useReloadShow } from '#web/features/catalog/use-reload-show.hook';
import { useAuth } from '#web/shared/lib/auth';

const STILL = ['still'] as const;

/** The buttons on an episode's row that open its name, air date and summary,
 * and its thumbnail, to a person who manages the library, and reload its show
 * once they close them. Nothing for anyone else. */
export function EpisodeEditButtons({
  episode,
  title,
}: Readonly<{ episode: MediaItem; title: string }>) {
  const t = useT();
  const { user } = useAuth();
  const reloadAfter = useReloadShow(episode.showId);
  if (!user || !hasPermission(user, 'library.manage')) {
    return null;
  }
  const id = episode.id;
  const editInfo = () => TitleInfoDialog.call({ kind: 'episode', id, title });
  const editStill = () => ArtworkDialog.call({ kind: 'item', id, title, roles: STILL });
  return (
    <>
      <IconButton
        icon="pencil"
        label={t('titleInfo.action')}
        onPress={() => void reloadAfter(editInfo())}
      />
      <IconButton
        icon="photo"
        label={t('artwork.stillAction')}
        onPress={() => void reloadAfter(editStill())}
      />
    </>
  );
}
