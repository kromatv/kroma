import { useT } from '@kromatv/ui';
import { Box, Callout, Dialog, InputGroup, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { useAsyncAction } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { PermPicker, usePermissionSet } from '#web/features/admin/users-permissions';

/** Create an invite link. Resolves `true` if an invite was created (the caller
 * refreshes the pending list), `false` if dismissed without creating one. */
export const InviteModal = createCallable<void, boolean>(({ call }) => {
  const t = useT();
  const { client } = useAuth();
  const [perms, toggle] = usePermissionSet(['playback']);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { busy, run } = useAsyncAction();
  const close = () => call.end(link !== null);

  const create = () =>
    run(async () => {
      const res = await client.accounts.createInvite({ permissions: [...perms] });
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setLink(res.url ?? `${origin}/join?invite=${res.token}`);
    });

  // `navigator.clipboard` is undefined outside a secure context, so on a
  // plain-http LAN address this throws synchronously, not via rejection.
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context) or blocked */
    }
  }

  return (
    <Dialog.Root open title={t('nav.inviteUser')} onClose={close} width="lg">
      <Box>
        <Text variant="meta" color="textDim" mb={16}>
          {t('admin.inviteIntro')}
        </Text>
        <PermPicker selected={perms} toggle={toggle} />
      </Box>
      {link ? (
        <Callout.Root tone="accent">
          <Callout.Title>{t('admin.inviteLink')}</Callout.Title>
          <InputGroup.Root label={t('admin.inviteLink')}>
            <InputGroup.Input value={link} autoFocus={false} />
            <InputGroup.Addon align="inline-end">
              <InputGroup.Button
                icon="copy"
                label={copied ? t('common.copied') : t('common.copy')}
                onPress={() => void copy(link)}
              />
            </InputGroup.Addon>
          </InputGroup.Root>
        </Callout.Root>
      ) : null}
      <Dialog.Footer>
        {link ? (
          <Dialog.Actions onCancel={close} cancelLabel={t('common.close')} />
        ) : (
          <Dialog.Actions
            onCancel={close}
            cancelLabel={t('common.cancel')}
            onConfirm={() => void create()}
            confirmLabel={busy ? t('common.creating') : t('admin.createLink')}
            busy={busy}
            disabled={perms.size === 0}
          />
        )}
      </Dialog.Footer>
    </Dialog.Root>
  );
});
