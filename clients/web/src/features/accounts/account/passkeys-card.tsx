// Passkeys section ("Clés d'accès"): register WebAuthn credentials for
// passwordless sign-in, list them, and remove them. WebAuthn only works in a
// secure context (HTTPS or localhost), so on plain-HTTP LAN access the card
// shows a notice instead of the add button.

import { apiErrorText, type PasskeyInfo } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, Icon, IconWell, ListRow, Text } from '@kroma/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { relativeSeen } from '#web/shared/lib/adminFormat';
import { kromaClient } from '#web/shared/lib/api';
import { deviceInfo } from '#web/shared/lib/device';
import { userQueries } from '#web/shared/lib/queries';
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
  const t = useT();
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    setRemoving(true);
    try {
      await kromaClient().deletePasskey(passkey.id);
      onRemoved();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <ListRow.Root
      label={passkey.name}
      hint={passkey.lastUsed ? relativeSeen(passkey.lastUsed) : t('account.passkeyNeverUsed')}
    >
      <ListRow.Leading>
        <Box center w={38} h={38} radius="xs" border="border" bg="surface2">
          <Icon name="key" size={18} stroke={1.7} color="success" />
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
  const t = useT();
  const qc = useQueryClient();
  const supported = passkeysSupported();
  const { data: keys } = useQuery({ ...userQueries.passkeys(), enabled: supported });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['passkeys'] });

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const client = kromaClient();
      const { ceremonyId, options } = await client.passkeyRegisterStart();
      const credential = await createPasskey(options);
      const name = deviceInfo(navigator.userAgent, t('account.unknownDevice')).label;
      await client.passkeyRegisterFinish({ ceremonyId, name, credential });
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
      <ListRow.Root label={t('account.passkeys')} hint={t('account.passkeysDesc')}>
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
