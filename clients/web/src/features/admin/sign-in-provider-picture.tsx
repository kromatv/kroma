import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/ui';
import { Box, Button, Dropzone, Row, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { pictureOf, type ProviderForm } from '#web/features/admin/sign-in-form';
import { useAuth } from '#web/shared/lib/auth';
import { ProviderMark } from '#web/shared/ui/provider-mark';

const MAX_PICTURE_BYTES = 256 * 1024;

/** The picture on a provider's button: the preset's logo unless the admin
 * uploads one of their own. An upload is saved at once, so it needs a
 * provider the server already knows. */
export function PictureField({
  provider: p,
  onChanged,
}: Readonly<{ provider: ProviderForm; onChanged: () => void }>) {
  const t = useT();
  const { client } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = p.id;

  const run = async (change: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await change();
      onChanged();
    } catch (e) {
      setError(apiErrorText(e, t('admin.signInPictureFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box mb={16} maxW={560}>
      <Text variant="label" mb={8}>
        {t('admin.signInPicture')}
      </Text>
      <Row gap={14} align="center">
        <ProviderMark icon={p.icon} image={pictureOf(p)} size={44} />
        {id ? (
          <Box flex minW={0}>
            <Dropzone.Root
              label={t('admin.signInPictureUpload')}
              accept=".svg,.png,.jpg,.jpeg,.webp"
              maxSize={MAX_PICTURE_BYTES}
              onDrop={(files) => {
                const file = files[0];
                if (file) void run(() => client.sso.uploadImage(id, file));
              }}
              onReject={() => setError(t('admin.signInPictureTooBig'))}
            >
              <Dropzone.Icon name="photo-up" />
              <Dropzone.Title>{t('admin.signInPictureUpload')}</Dropzone.Title>
              <Dropzone.Description>{t('admin.signInPictureHint')}</Dropzone.Description>
            </Dropzone.Root>
          </Box>
        ) : (
          <Text variant="meta" color="textDim">
            {t('admin.signInPictureSaveFirst')}
          </Text>
        )}
        {id && p.hasImage ? (
          <Button
            variant="ghost"
            size="sm"
            icon="trash"
            label={t('admin.signInPictureRemove')}
            disabled={busy}
            onPress={() => void run(() => client.sso.removeImage(id))}
          />
        ) : null}
      </Row>
      {error ? (
        <Text variant="meta" color="danger" mt={8}>
          {error}
        </Text>
      ) : null}
    </Box>
  );
}
