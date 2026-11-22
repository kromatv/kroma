import type { Invite } from '@kromatv/client/accounts';
import { useLocale, useT } from '@kromatv/ui';
import { Button, Icon, IconButton, ListRow, Row, styles, useStyles } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';
import { copyText } from '#web/shared/lib/copy-text';
import { invitationLink } from '#web/shared/lib/invitation-link';
import { InvitationMailDialog } from '#web/shared/ui/invitation-mail.component';

const sDefinition = styles({
  dashed: { borderWidth: 1, borderColor: 'text/25', borderStyle: 'dashed' },
});

const COPIED_MS = 1500;

function useCopiedLink(inv: Invite) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(invitationLink({ url: null, token: inv.token }))) {
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    }
  };
  return { copied, copy };
}

function PendingActions({ inv, onChange }: Readonly<{ inv: Invite; onChange: () => void }>) {
  const t = useT();
  const { client } = useAuth();
  const { copied, copy } = useCopiedLink(inv);
  const [mailing, setMailing] = useState(false);
  return (
    <>
      <IconButton
        variant="ghost"
        icon="mail"
        label={t('admin.invitationMail')}
        onPress={() => setMailing(true)}
      />
      <Button
        variant="glass"
        size="sm"
        label={copied ? t('common.linkCopied') : t('admin.resend')}
        onPress={() => void copy()}
      />
      <Button
        variant="danger"
        size="sm"
        label={t('common.cancel')}
        onPress={() => void client.accounts.revokeInvite(inv.token).then(onChange)}
      />
      {mailing ? (
        <InvitationMailDialog token={inv.token} onClose={() => setMailing(false)} />
      ) : null}
    </>
  );
}

/** An invitation that creates an account and nobody has redeemed yet: what it
 * lets its account do, when it lapses, and the owner's ways to hand it over or
 * take it back. */
export function PendingInvite({ inv, onChange }: Readonly<{ inv: Invite; onChange: () => void }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const locale = useLocale();
  return (
    <ListRow.Root size="md">
      <ListRow.Label>{inv.permissions.join(', ') || t('permissions.playback')}</ListRow.Label>
      <ListRow.Hint>
        {t('admin.expiresOn', {
          date: new Date(inv.expiresAt * 1000).toLocaleDateString(locale),
        })}
      </ListRow.Hint>
      <ListRow.Leading>
        <Row center w={42} h={42} shrink={0} radius="circle" style={s.dashed}>
          <Icon name="mail" size={18} thickness={1.8} color="textDim" />
        </Row>
      </ListRow.Leading>
      <ListRow.Trailing>
        <PendingActions inv={inv} onChange={onChange} />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}
