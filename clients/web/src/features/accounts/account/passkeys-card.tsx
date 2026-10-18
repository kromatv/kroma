import { useWebRuntime } from '#web/shared/lib/web-runtime';
// Passkeys section ("Clés d'accès"): register WebAuthn credentials for
// passwordless sign-in, list them, and remove them. WebAuthn only works in a
// secure context (HTTPS or localhost), so on plain-HTTP LAN access the card
// shows a notice instead of the add button.

import { apiErrorText } from '@kromatv/client';
import type { PasskeyInfo } from '@kromatv/client/accounts';
import { useFormat, useT } from '@kromatv/ui';
import { Box, Button, Icon, IconWell, ListRow, Text } from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { deviceInfo } from '#web/shared/lib/device';

import { createPasskey, passkeysSupported } from '#web/shared/lib/webauthn';

function isCancel(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError');
}

// WebAuthn failures are DOMExceptions whose `name` (e.g. SecurityError for an
// invalid RP id like an IP address) is the actionable part.
function ceremonyError(e: unknown, fallback: string): string {
  if (e instanceof DOMException) return `${fallback} (${e.name})`;
  return apiErrorText(e, fallback);
}

function PasskeyRow({
  passkey,
  onRemoved,
}: Readonly<{ passkey: PasskeyInfo; onRemoved: () => void }>) {
  const webRuntime = useWebRuntime();

  const t = useT();
  const fmt = useFormat();
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    setRemoving(true);
    try {
      await webRuntime.client.accounts.passkeys.delete(passkey.id);
      onRemoved();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <ListRow.Root>
      <ListRow.Label>{passkey.name}</ListRow.Label>
      <ListRow.Hint>
        {passkey.lastUsed ? fmt.elapsed(passkey.lastUsed) : t('account.passkeyNeverUsed')}
      </ListRow.Hint>
      <ListRow.Leading>
        <Box center w={38} h={38} radius="xs" border="border" bg="surface2">
          <Icon name="key" size={18} thickness={1.7} color="success" />
        </Box>
      </ListRow.Leading>
      <ListRow.Trailing>
        <Button variant="ghost" size="sm" onPress={remove} loading={removing}>
          <Text variant="meta" color="danger">
            {removing ? t('common.saving') : t('common.delete')}
          </Text>
        </Button>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

export function PasskeysCard() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const qc = useQueryClient();
  const supported = passkeysSupported();
  const { data: keys } = useQuery({
    ...webRuntime.queries.userQueries.passkeys(),
    enabled: supported,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: webRuntime.queries.userQueries.passkeys().queryKey });

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const client = webRuntime.client;
      const { ceremonyId, options } = await client.accounts.passkeys.registerStart();
      const credential = await createPasskey(options);
      const name = deviceInfo(navigator.userAgent, t('account.unknownDevice')).label;
      await client.accounts.passkeys.registerFinish({ ceremonyId, name, credential });
      await invalidate();
    } catch (e) {
      if (!isCancel(e)) {
        console.error('passkey registration failed', e);
        setError(ceremonyError(e, t('account.passkeyAddFailed')));
      }
    } finally {
      setBusy(false);
    }
  };

  const note = noteOf(supported, keys, t);
  return (
    <ListRow.Group size="md">
      <ListRow.Root>
        <ListRow.Label>{t('account.passkeys')}</ListRow.Label>
        <ListRow.Hint>{t('account.passkeysDesc')}</ListRow.Hint>
        <ListRow.Leading>
          <IconWell name="shield-lock" size="sm" tone="accent" />
        </ListRow.Leading>
        {supported ? (
          <ListRow.Trailing>
            <Button
              size="sm"
              icon="plus"
              label={busy ? t('common.saving') : t('account.passkeyAdd')}
              onPress={add}
              loading={busy}
            />
          </ListRow.Trailing>
        ) : null}
      </ListRow.Root>
      {error ? (
        <ListRow.Root>
          <Text variant="meta" color="danger">
            {error}
          </Text>
        </ListRow.Root>
      ) : null}
      {note ? (
        <ListRow.Root>
          <Text variant="meta" color="textMuted">
            {note}
          </Text>
        </ListRow.Root>
      ) : null}
      {(keys ?? []).map((k) => (
        <PasskeyRow key={k.id} passkey={k} onRemoved={() => void invalidate()} />
      ))}
    </ListRow.Group>
  );
}

function noteOf(
  supported: boolean,
  keys: PasskeyInfo[] | undefined,
  t: ReturnType<typeof useT>,
): string | null {
  if (!supported) return t('account.passkeysInsecure');
  if (!keys || keys.length === 0) return t('account.passkeysEmpty');
  return null;
}
