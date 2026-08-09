// Edit modal for an existing external download client (Transmission RPC or
// qBittorrent WebUI). The kind is fixed once a client exists, so this is edit-only
// (name / URL / credentials); adding a client goes through the generic
// add-engine dialog, driven by the enabled download-client engines. The embedded
// engine has no form (configured from the Acquisition settings page).

import { apiErrorText, useAsyncAction, useT } from '@kroma/module-sdk';
import { Dialog, DialogActions, Field } from '@kroma/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { useTorrentsApi } from './api';
import type { DownloadClientView, SaveDownloadClientBody } from './schemas';

export const DownloadClientModal = createCallable<
  { /** The external client being edited (kind is fixed). */ client: DownloadClientView },
  boolean
>(({ call, client }) => {
  const t = useT();
  const torrents = useTorrentsApi();
  const { busy, error, run } = useAsyncAction();
  const [name, setName] = useState(client.name);
  const [url, setUrl] = useState(client.url);
  const [username, setUsername] = useState(client.username);
  const [password, setPassword] = useState('');

  const save = () =>
    run(
      async () => {
        const body: SaveDownloadClientBody = {
          kind: null,
          name: name.trim() || null,
          url: url.trim() || null,
          username: username.trim() || null,
          password: password || null,
          enabled: null,
          priority: null,
        };
        await torrents.updateClient(client.id, body);
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
    <Dialog open title={t('dlclients.edit')} onClose={() => call.end(false)} width={520}>
      <Field
        label={t('dlclients.name')}
        value={name}
        onChange={setName}
        placeholder={client.kind}
      />
      <Field
        label={t('dlclients.url')}
        hint={t('dlclients.urlHint')}
        value={url}
        onChange={setUrl}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('dlclients.username')} value={username} onChange={setUsername} />
        <Field
          label={t('dlclients.password')}
          hint={client.hasPassword ? t('dlclients.passwordKept') : undefined}
          value={password}
          onChange={setPassword}
          type="password"
        />
      </div>
      {error ? <p className="text-[13px] font-semibold text-[#EF8091]">{error}</p> : null}
      <DialogActions
        onCancel={() => call.end(false)}
        cancelLabel={t('common.cancel')}
        onConfirm={save}
        confirmLabel={busy ? t('common.saving') : t('common.save')}
        busy={busy}
        disabled={!url.trim()}
        destructive={
          client.builtin
            ? undefined
            : { label: t('dlclients.delete'), onPress: remove, disabled: busy }
        }
      />
    </Dialog>
  );
});
