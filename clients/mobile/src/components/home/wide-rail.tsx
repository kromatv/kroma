import { sizedImageUrl } from '@kromatv/core';
import { useRouter } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import {
  entryBackdrop,
  entryId,
  entryRoute,
  entryTitle,
  type RowEntry,
} from '#mobile/lib/home-sections';
import { useClient } from '#mobile/lib/session';
import { LandscapeRail, landscapeWidth } from './landscape-rail';

/** A section drawn on backdrops, each title with the server's note under it. */
export function WideRail({ entries }: Readonly<{ entries: readonly RowEntry[] }>) {
  const client = useClient();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const artWidth = landscapeWidth(windowWidth);

  return (
    <LandscapeRail
      tiles={entries.map(({ entry, note }) => ({
        key: entryId(entry),
        title: entryTitle(entry),
        detail: note,
        art: sizedImageUrl(entryBackdrop(entry, client), artWidth),
        onPress: () => router.push(entryRoute(entry)),
      }))}
    />
  );
}
