import { posterColors } from '@kromatv/core';
import { useCallback } from 'react';
import { useWatched } from '#tv/app/providers/watched';
import { useNav } from '#tv/app/router';
import type { HomeEntry } from '#tv/features/catalog/home/sectionEntry';
import type { HeldTitle } from '#tv/features/catalog/TitleMenu';

interface HomeTile {
  title: string;
  tint: [string, string];
  watched: boolean;
  progress: number | null;
  onPress: () => void;
  onLongPress: () => void;
}

/** What a home tile says and does for its entry, whichever card draws it: OK
 * opens the title's page and a held OK hands the title to `onHold`. */
export function useHomeTile(onHold: (title: HeldTitle) => void): (entry: HomeEntry) => HomeTile {
  const { go } = useNav();
  const { has: isWatched } = useWatched();
  return useCallback(
    (entry) => {
      if (entry.type === 'show') {
        const { show } = entry;
        return {
          title: show.title,
          tint: posterColors(show.id),
          watched: isWatched(show.id),
          progress: show.progress == null ? null : show.progress / 100,
          onPress: () => go('show', { show }),
          onLongPress: () => onHold({ kind: 'show', item: show }),
        };
      }
      const { item } = entry;
      return {
        title: item.title,
        tint: posterColors(item.id),
        watched: isWatched(item.id),
        progress: null,
        onPress: () => go('movie', { item }),
        onLongPress: () => onHold({ kind: 'movie', item }),
      };
    },
    [go, isWatched, onHold],
  );
}
