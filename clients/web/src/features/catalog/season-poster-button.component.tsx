import { hasPermission } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { IconButton } from '@kromatv/ui/kit';

import { ArtworkDialog } from '#web/features/catalog/artwork-dialog.component';
import { useReloadShow } from '#web/features/catalog/use-reload-show.hook';
import { useAuth } from '#web/shared/lib/auth';
import type { TitleSeason } from '#web/shared/lib/title-view';

const POSTER = ['poster'] as const;

/** The button over a show's episodes that opens the poster of the season shown to a
 * person who manages the library, and reloads the show once they close it. Nothing for
 * anyone else, nor for a season with no episode on disk. */
export function SeasonPosterButton({ season }: Readonly<{ season: TitleSeason }>) {
  const t = useT();
  const { user } = useAuth();
  const episode = season.episodes[0];
  const showId = episode?.showId;
  const reloadAfter = useReloadShow(showId ?? null);
  if (!user || !hasPermission(user, 'library.manage') || !showId) {
    return null;
  }
  const name = t('content.season', { number: season.number });
  const title = episode.showTitle ? `${episode.showTitle} · ${name}` : name;
  const id = `${showId}:${season.number}`;
  const edit = () => ArtworkDialog.call({ kind: 'season', id, title, roles: POSTER });
  return (
    <IconButton
      icon="photo"
      label={t('artwork.seasonAction')}
      onPress={() => void reloadAfter(edit())}
    />
  );
}
