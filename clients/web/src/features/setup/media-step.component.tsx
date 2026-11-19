import { apiErrorText } from '@kromatv/client';
import type { AdminLibrary } from '@kromatv/client/library';
import type { LibraryId } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { Button, IconButton, ListRow, Text } from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ScanFeed } from '#web/features/setup/scan-feed';
import { ScanLive } from '#web/features/setup/scan-live.component';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';
import { StepFailure } from '#web/features/setup/step-failure.component';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { FolderListEditor } from '#web/shared/ui/folder-field.component';

const LIBRARIES = ['setup', 'libraries'] as const;
const PATH_TAIL = 3;

interface MediaStepProps {
  feed: ScanFeed;
  onBack: () => void;
  onContinue: () => void;
}

/** What a library made from one folder is called: the folder's own name. */
export function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
  return parts.at(-1) ?? path;
}

/** A path short enough for one line: its last folders, after a mark that says
 * the start was cut. */
export function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
  return parts.length <= PATH_TAIL ? path : `…/${parts.slice(-PATH_TAIL).join('/')}`;
}

/** The libraries somebody added. The demo ones, which a server with no media
 * of its own shows, are nobody's answer to where the media is. */
export function ownLibraries(libraries: readonly AdminLibrary[]): AdminLibrary[] {
  return libraries.filter((library) => !library.demo);
}

function useLibraries() {
  const { client } = useWebRuntime();
  return useQuery({
    queryKey: LIBRARIES,
    queryFn: async () => (await client.library.list()).libraries,
  });
}

function oneAtATime<T>(items: readonly T[], run: (item: T) => Promise<unknown>): Promise<unknown> {
  return items.reduce<Promise<unknown>>(
    (earlier, item) => earlier.then(() => run(item)),
    Promise.resolve(),
  );
}

function useAddFolders(onAdded: () => void) {
  const t = useT();
  const { client } = useWebRuntime();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async (folders: readonly string[]) => {
    setBusy(true);
    setError(null);
    try {
      await oneAtATime(folders, (folder) =>
        client.library.create({ name: folderName(folder), folders: [folder] }),
      );
      await queryClient.invalidateQueries({ queryKey: LIBRARIES });
      onAdded();
    } catch (cause) {
      setError(apiErrorText(cause, t('setup.mediaFailed')));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, add };
}

interface PickFoldersProps {
  onBack: () => void;
  onSkip?: () => void;
  onAdded: () => void;
}

function PickFolders({ onBack, onSkip, onAdded }: Readonly<PickFoldersProps>) {
  const t = useT();
  const [folders, setFolders] = useState<string[]>([]);
  const { busy, error, add } = useAddFolders(onAdded);
  return (
    <>
      <StepHeading title={t('setup.mediaTitle')} sub={t('setup.mediaSub')} />
      <StepBody>
        <FolderListEditor folders={folders} onChange={setFolders} />
        <Text variant="meta" color="textDim">
          {t('setup.mediaHint')}
        </Text>
        <StepFailure error={error} />
      </StepBody>
      <StepActions onBack={onBack}>
        {onSkip ? (
          <Button variant="ghost" size="md" label={t('setup.skip')} onPress={onSkip} />
        ) : null}
        <Button
          size="md"
          label={t('setup.mediaStart')}
          loading={busy}
          disabled={folders.length === 0}
          onPress={() => void add(folders)}
        />
      </StepActions>
    </>
  );
}

function useRemoveLibrary() {
  const { client } = useWebRuntime();
  const queryClient = useQueryClient();
  return async (id: LibraryId) => {
    await client.library.delete(id).catch(() => undefined);
    await queryClient.invalidateQueries({ queryKey: LIBRARIES });
  };
}

function LibraryRows({ libraries }: Readonly<{ libraries: readonly AdminLibrary[] }>) {
  const t = useT();
  const remove = useRemoveLibrary();
  return (
    <ListRow.Group>
      {libraries.map((library) => (
        <ListRow.Root key={library.id} icon="folder" label={library.name} chevron={false}>
          <ListRow.Label>{library.name}</ListRow.Label>
          <ListRow.Hint lines={1}>{library.folders.map(shortPath).join(', ')}</ListRow.Hint>
          <ListRow.Trailing>
            <IconButton
              variant="ghost"
              diameter={32}
              glyph={16}
              icon="trash"
              label={t('setup.mediaRemove', { name: library.name })}
              onPress={() => void remove(library.id)}
            />
          </ListRow.Trailing>
        </ListRow.Root>
      ))}
    </ListRow.Group>
  );
}

function AddMore({ onAddMore }: Readonly<{ onAddMore: () => void }>) {
  const t = useT();
  return (
    <>
      <Button
        variant="outline"
        size="md"
        icon="folder-plus"
        label={t('setup.mediaAddMore')}
        onPress={onAddMore}
      />
      <Text variant="meta" color="textDim">
        {t('setup.mediaRemoveHint')}
      </Text>
    </>
  );
}

function LibraryArriving({
  libraries,
  feed,
  onAddMore,
  onBack,
  onContinue,
}: Readonly<MediaStepProps & { libraries: readonly AdminLibrary[]; onAddMore: () => void }>) {
  const t = useT();
  return (
    <>
      <StepHeading title={t('setup.mediaLiveTitle')} sub={t('setup.mediaLiveSub')} />
      <StepBody>
        <ScanLive feed={feed} />
        <LibraryRows libraries={libraries} />
        <AddMore onAddMore={onAddMore} />
      </StepBody>
      <StepActions onBack={onBack}>
        <Button
          size="md"
          label={t('setup.continue')}
          iconRight="arrow-right"
          onPress={onContinue}
        />
      </StepActions>
    </>
  );
}

/** Where the media is. Each folder becomes a library and its scan starts at
 * once. From then on the step shows the library arriving, and the owner goes
 * on while it does. */
export function MediaStep({ feed, onBack, onContinue }: Readonly<MediaStepProps>) {
  const { data } = useLibraries();
  const [adding, setAdding] = useState(false);
  if (!data) {
    return null;
  }
  const libraries = ownLibraries(data);
  if (libraries.length === 0) {
    return <PickFolders onBack={onBack} onSkip={onContinue} onAdded={() => setAdding(false)} />;
  }
  if (adding) {
    return <PickFolders onBack={() => setAdding(false)} onAdded={() => setAdding(false)} />;
  }
  return (
    <LibraryArriving
      libraries={libraries}
      feed={feed}
      onAddMore={() => setAdding(true)}
      onBack={onBack}
      onContinue={onContinue}
    />
  );
}
