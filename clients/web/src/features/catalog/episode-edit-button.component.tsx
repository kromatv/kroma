import { hasPermission } from '@kromatv/client/accounts';
import { type MediaItem, ShowId } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { IconButton } from '@kromatv/ui/kit';
import { useQueryClient } from '@tanstack/react-query';

import { TitleInfoDialog } from '#web/features/catalog/title-info-dialog.component';
import { useAuth } from '#web/shared/lib/auth';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** The button on an episode's row that opens its name, air date and summary
 * to a person who manages the library, and reloads its show once they close
 * it. Nothing for anyone else. */
export function EpisodeEditButton({
  episode,
  title,
}: Readonly<{ episode: MediaItem; title: string }>) {
  const t = useT();
  const { user } = useAuth();
  const { queries } = useWebRuntime();
  const queryClient = useQueryClient();
  if (!user || !hasPermission(user, 'library.manage')) {
    return null;
  }
  const edit = async () => {
    await TitleInfoDialog.call({ kind: 'episode', id: episode.id, title });
    if (episode.showId) {
      const show = queries.catalogQueries.show(ShowId.parse(episode.showId));
      await queryClient.invalidateQueries({ queryKey: show.queryKey });
    }
  };
  return <IconButton icon="pencil" label={t('titleInfo.action')} onPress={() => void edit()} />;
}
