// Edit modal for an existing external download client. The kind is fixed once a
// client exists, so this is edit-only, over the fields its engine module declares;
// adding a client goes through the generic add-engine dialog. The embedded engine
// has no form (configured from the Acquisition settings page).

import {
  apiErrorText,
  FieldForm,
  useAsyncAction,
  useEnabledEngines,
  useT,
} from '@kromatv/module-sdk';
import { Box, Button, Dialog, Field, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { useTorrentsApi } from './api.hook';
import { clientBody, declaredValues, fieldsOf, keepsSecrets } from './client-fields';
import type { DownloadClientView } from './schemas';

export const DownloadClientModal = createCallable<
  { /** The external client being edited (kind is fixed). */ client: DownloadClientView },
  boolean
>(({ call, client }) => {
  const t = useT();
  const torrents = useTorrentsApi();
  const { busy, error, run } = useAsyncAction();
  const engines = useEnabledEngines('tv.kroma.torrents/client');
  const fields = fieldsOf(engines, client.kind);
  const [name, setName] = useState(client.name);
  const [values, setValues] = useState<Record<string, string>>({
    url: client.url,
    username: client.username,
  });

  const save = () =>
    run(
      async () => {
        await torrents.updateClient(client.id, {
          kind: null,
          ...clientBody({ ...declaredValues(fields, values), name }),
          enabled: null,
          priority: null,
        });
        call.end(true);
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  const remove = () =>
    run(
      async () => {
        await torrents.deleteClient(client.id);
        call.end(true);
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Dialog.Root open title={t('dlclients.edit')} onClose={() => call.end(false)} width="md">
      <Box gap={16}>
        <Field.Root label={t('dlclients.name')} value={name} onValueChange={setName}>
          <Field.Input placeholder={client.kind} />
        </Field.Root>
        <FieldForm
          fields={fields}
          values={values}
          onChange={(key, value) => setValues((all) => ({ ...all, [key]: value }))}
        />
        {keepsSecrets(client) ? (
          <Text variant="meta" color="text/45">
            {t('dlclients.secretsKept')}
          </Text>
        ) : null}
        {error ? (
          <Text variant="meta" color="dangerHover">
            {error}
          </Text>
        ) : null}
      </Box>
      <Dialog.Actions
        onCancel={() => call.end(false)}
        cancelLabel={t('common.cancel')}
        onConfirm={save}
        confirmLabel={busy ? t('common.saving') : t('common.save')}
        busy={busy}
        disabled={!values.url?.trim()}
      >
        {client.builtin ? null : (
          <Button
            variant="dangerGhost"
            size="sm"
            label={t('dlclients.delete')}
            onPress={remove}
            disabled={busy}
          />
        )}
      </Dialog.Actions>
    </Dialog.Root>
  );
});
