import { useT } from '@kromatv/ui';
import { Box, Cropper, Dialog, useCropper } from '@kromatv/ui/kit';
import { StatusText, useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';

const AVATAR_SIDE = 512;

type Save = ReturnType<typeof useSave>;

function AvatarEditor({
  file,
  save,
  onClose,
}: Readonly<{ file: File; save: Save; onClose: () => void }>) {
  const t = useT();
  const { client, updateUser } = useAuth();
  const { crop } = useCropper();
  const busy = save.status === 'saving';

  const submit = () => {
    if (busy) {
      return;
    }
    void save.run(async () => {
      const framed = await crop({ width: AVATAR_SIDE, height: AVATAR_SIDE });
      const { avatarUrl } = await client.accounts.uploadAvatar(framed ?? file);
      updateUser({ avatarUrl });
      onClose();
    }, t('account.avatarFailed'));
  };

  return (
    <>
      <Box gap={14}>
        <Cropper.Frame label={t('account.avatarFrame')} />
        <Box row align="center" gap={8}>
          <Cropper.Zoom outLabel={t('account.avatarZoomOut')} inLabel={t('account.avatarZoomIn')} />
          <Box flex />
          <Cropper.Rotate label={t('account.avatarRotate')} />
          <Cropper.Reset label={t('account.avatarReset')} />
        </Box>
        <StatusText status={save.status === 'saved' ? 'idle' : save.status} error={save.error} />
      </Box>
      <Dialog.Actions
        onCancel={onClose}
        cancelLabel={t('common.cancel')}
        onConfirm={submit}
        confirmLabel={t('account.avatarSave')}
        busy={busy}
      />
    </>
  );
}

/** Frames a picked photo in the circle the avatar is shown in, then uploads the
 * crop. `src` is an object URL of `file` that the caller made and revokes. A
 * browser that cannot draw the crop sends the photo as it was picked. */
export function AvatarDialog({
  file,
  src,
  onClose,
}: Readonly<{ file: File; src: string; onClose: () => void }>) {
  const t = useT();
  const save = useSave();
  const busy = save.status === 'saving';

  return (
    <Dialog.Root
      open
      title={t('account.avatarCropTitle')}
      description={t('account.avatarCropHint')}
      width="sm"
      onClose={busy ? () => {} : onClose}
    >
      <Cropper.Root src={src} shape="circle">
        <AvatarEditor file={file} save={save} onClose={onClose} />
      </Cropper.Root>
    </Dialog.Root>
  );
}
