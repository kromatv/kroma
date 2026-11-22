import type { ImportFolder } from '@kromatv/client/imports';
import { useT } from '@kromatv/ui';
import { Box, ListRow, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { answered } from '#web/features/admin/import/import-folders';
import { useImportSession } from '#web/features/admin/import/import-session.component';
import { FolderPicker } from '#web/shared/ui/folder-picker.component';

interface PlaceProps {
  place: ImportFolder;
  browsing: boolean;
  onPress: () => void;
}

function FolderPlace({ place, browsing, onPress }: Readonly<PlaceProps>) {
  const t = useT();
  return (
    <ListRow.Root
      icon={place.here ? 'folder' : 'folder-off'}
      label={place.folder}
      selected={browsing || undefined}
      onPress={onPress}
    >
      <ListRow.Label>{place.folder}</ListRow.Label>
      <ListRow.Hint>
        {place.here
          ? t('setup.importFolderHere', { path: place.here })
          : t('setup.importFolderMissing')}
      </ListRow.Hint>
    </ListRow.Root>
  );
}

interface PlacesProps {
  places: readonly ImportFolder[];
  browsing: string | null;
  onBrowse: (folder: string) => void;
}

function FolderPlaces({ places, browsing, onBrowse }: Readonly<PlacesProps>) {
  return (
    <ListRow.Group>
      {places.map((place) => (
        <FolderPlace
          key={place.folder}
          place={place}
          browsing={place.folder === browsing}
          onPress={() => onBrowse(place.folder)}
        />
      ))}
    </ListRow.Group>
  );
}

function useBrowsing() {
  const { session, update } = useImportSession();
  const [browsing, setBrowsing] = useState<string | null>(null);
  const choose = (here: string) => {
    if (browsing !== null) {
      update({ folders: answered(session.folders, { folder: browsing, here }) });
    }
    setBrowsing(null);
  };
  return { browsing, setBrowsing, choose };
}

/** Where each folder of the libraries the owner kept is on this machine. The
 * owner presses a folder to say where it is, or to correct what the server
 * found. A library is made over no folder that has no place here. */
export function ReviewFolders({ places }: Readonly<{ places: readonly ImportFolder[] }>) {
  const t = useT();
  const { browsing, setBrowsing, choose } = useBrowsing();
  const open = places.find((place) => place.folder === browsing);
  if (places.length === 0) {
    return null;
  }
  return (
    <Box gap={8}>
      <Text variant="overline" color="textDim">
        {t('setup.importFolders')}
      </Text>
      <Text variant="meta" color="textMuted">
        {t('setup.importFoldersSub')}
      </Text>
      <FolderPlaces places={places} browsing={browsing} onBrowse={setBrowsing} />
      {open ? (
        <FolderPicker
          key={open.folder}
          value={open.here ?? ''}
          onChange={choose}
          onCancel={() => setBrowsing(null)}
        />
      ) : null}
    </Box>
  );
}
