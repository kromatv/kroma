import type { Invite } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Button, Icon, ListRow, Row, styles, useStyles } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';

const sDefinition = styles({
  dashed: { borderWidth: 1, borderColor: 'text/25', borderStyle: 'dashed' },
});

export function PendingInvite({ inv, onChange }: Readonly<{ inv: Invite; onChange: () => void }>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const { client } = useAuth();
  const [copied, setCopied] = useState(false);
  async function resend() {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    try {
      await navigator.clipboard.writeText(`${origin}/join?invite=${inv.token}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <ListRow.Root size="md">
      <ListRow.Label>{inv.permissions.join(', ') || t('permissions.playback')}</ListRow.Label>
      <ListRow.Hint>
        {t('admin.expiresOn', {
          date: new Date(inv.expiresAt * 1000).toLocaleDateString('fr-FR'),
        })}
      </ListRow.Hint>
      <ListRow.Leading>
        <Row center w={42} h={42} shrink={0} radius="circle" style={s.dashed}>
          <Icon name="mail" size={18} thickness={1.8} color="textDim" />
        </Row>
      </ListRow.Leading>
      <ListRow.Trailing>
        <Button
          variant="glass"
          size="sm"
          label={copied ? t('common.linkCopied') : t('admin.resend')}
          onPress={() => void resend()}
        />
        <Button
          variant="danger"
          size="sm"
          label={t('common.cancel')}
          onPress={() => void client.accounts.revokeInvite(inv.token).then(onChange)}
        />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}
