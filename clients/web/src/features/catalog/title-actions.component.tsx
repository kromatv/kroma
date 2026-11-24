import { hasPermission, type Permission } from '@kromatv/client/accounts';
import { ItemId, ShowId } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { Box, Button } from '@kromatv/ui/kit';
import { useState } from 'react';

import { ArtworkDialog } from '#web/features/catalog/artwork-dialog.component';
import { RematchDialog } from '#web/features/catalog/rematch-dialog.component';
import { useAuth } from '#web/shared/lib/auth';
import { MediaInfoModal } from '#web/shared/ui/media-info-modal.component';

type Props = Readonly<{
  kind: 'item' | 'show';
  id: string;
  title: string;
  onChanged: () => void;
}>;

function usePermits() {
  const { user } = useAuth();
  const can = (permission: Permission) => (user ? hasPermission(user, permission) : false);
  return { admin: can('settings.manage'), library: can('library.manage') };
}

function useReprocess({ kind, id, onChanged }: Props) {
  const { client } = useAuth();
  const [busy, setBusy] = useState(false);
  const reprocess = () => {
    setBusy(true);
    client.pipeline
      .reprocessSubject(kind, kind === 'show' ? ShowId.parse(id) : ItemId.parse(id))
      .then(onChanged)
      .catch(() => {})
      .finally(() => setTimeout(() => setBusy(false), 1500));
  };
  return { busy, reprocess };
}

async function rematch({ kind, id, title, onChanged }: Props) {
  const applied = await RematchDialog.call({
    kind: kind === 'show' ? 'show' : 'movie',
    id,
    title,
  });
  if (applied) {
    onChanged();
  }
}

function LibraryActions(props: Props) {
  const t = useT();
  const { kind, id, title } = props;
  return (
    <>
      <Button
        variant="glass"
        size="sm"
        icon="photo"
        label={t('artwork.action')}
        onPress={() => void ArtworkDialog.call({ kind, id, title })}
      />
      <Button
        variant="glass"
        size="sm"
        icon="wand"
        label={t('rematch.action')}
        onPress={() => void rematch(props)}
      />
    </>
  );
}

/** The buttons on a title's page for the people who look after the library:
 * its media details, its artwork, its match and a reprocess. Each shows for the
 * permission it needs, and `onChanged` runs once a change is under way. */
export function TitleActions(props: Props) {
  const t = useT();
  const { admin, library } = usePermits();
  const { busy, reprocess } = useReprocess(props);
  return (
    <Box row align="center" gap={8} ml="auto">
      {admin && props.kind === 'item' ? (
        <Button
          variant="glass"
          size="sm"
          icon="file-info"
          label={t('mediaInfo.action')}
          onPress={() => void MediaInfoModal.call({ id: props.id, title: props.title })}
        />
      ) : null}
      {library ? <LibraryActions {...props} /> : null}
      {admin ? (
        <Button
          variant="glass"
          size="sm"
          icon="refresh"
          label={t('pipeline.reprocessBtn')}
          onPress={reprocess}
          loading={busy}
        />
      ) : null}
    </Box>
  );
}
