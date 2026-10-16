import { apiErrorText } from '@kromatv/client';
import { useAsyncAction, useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Dialog, Field, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAcquisitionApi } from './api';
import { ProfileOptions } from './profile-options';
import { ProfileTiers } from './profile-tiers';
import type { CustomFormat, QualityProfile } from './rules-schemas';

export function ProfileEditor({
  profile,
  formats,
  onClose,
  onSaved,
}: Readonly<{
  profile: QualityProfile;
  formats: readonly CustomFormat[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const [draft, setDraft] = useState(profile);
  const action = useAsyncAction();

  const save = () =>
    action.run(
      async () => {
        await acquisition.saveProfile({ ...draft, name: draft.name.trim() });
        await onSaved();
        onClose();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Dialog.Root open onClose={onClose} width="xl" title={t('acq.profileEdit')}>
      <Dialog.Header>
        <Text variant="title" accessibilityRole="header">
          {t('acq.profileEdit')}
        </Text>
        <Text variant="meta" color="textDim">
          {draft.id}
        </Text>
      </Dialog.Header>
      <Dialog.Panel>
        <Box gap={24}>
          {action.error ? (
            <Callout.Root tone="danger">
              <Callout.Title>{action.error}</Callout.Title>
            </Callout.Root>
          ) : null}

          <Box w={320}>
            <Field.Root
              label={t('acq.profileName')}
              value={draft.name}
              onValueChange={(name) => setDraft((d) => ({ ...d, name }))}
            >
              <Field.Input />
            </Field.Root>
          </Box>

          <ProfileTiers profile={draft} onChange={setDraft} />
          <ProfileOptions profile={draft} formats={formats} onChange={setDraft} />
        </Box>
      </Dialog.Panel>
      <Dialog.Footer>
        <Dialog.Actions>
          <Button variant="ghost" label={t('common.cancel')} onPress={onClose} />
          <Button
            icon="check"
            label={t('common.save')}
            loading={action.busy}
            disabled={draft.name.trim() === ''}
            onPress={save}
          />
        </Dialog.Actions>
      </Dialog.Footer>
    </Dialog.Root>
  );
}
