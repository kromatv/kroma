import type { Delivery, InviteToken } from '@kromatv/client/accounts';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, type CalloutTone, Dialog, Field, Row } from '@kromatv/ui/kit';
import { useState } from 'react';
import {
  type MailOutcome,
  plausibleAddress,
  useInvitationMail,
} from '#web/shared/lib/use-invitation-mail.hook';
import { RelayAllow } from '#web/shared/ui/relay-allow.component';

const ANSWER: Record<Exclude<Delivery, 'inactive'>, { tone: CalloutTone; words: MessageKey }> = {
  relay: { tone: 'success', words: 'admin.invitationMailSent' },
  smtp: { tone: 'success', words: 'admin.invitationMailSent' },
  manual: { tone: 'neutral', words: 'admin.invitationMailManual' },
  refused: { tone: 'danger', words: 'admin.invitationMailRefused' },
};

function Outcome({ outcome }: Readonly<{ outcome: MailOutcome }>) {
  const t = useT();
  if (outcome.kind === 'failed') {
    return (
      <Callout.Root tone="danger" size="sm">
        <Callout.Title>{outcome.reason}</Callout.Title>
        <Callout.Detail>{t('admin.invitationMailStillWorks')}</Callout.Detail>
      </Callout.Root>
    );
  }
  if (outcome.delivered === 'inactive') {
    return <RelayAllow />;
  }
  const { tone, words } = ANSWER[outcome.delivered];
  return (
    <Callout.Root tone={tone} size="sm">
      <Callout.Detail>{t(words, { email: outcome.to })}</Callout.Detail>
    </Callout.Root>
  );
}

interface InvitationMailProps {
  token: InviteToken;
  address?: string | null;
}

/** One address and a send button for the invitation `token` names, then how
 * the message left, or why it did not and what to do about it. `address` is
 * the mailbox the field starts with. */
export function InvitationMailForm({ token, address }: Readonly<InvitationMailProps>) {
  const t = useT();
  const [to, setTo] = useState(address ?? '');
  const { sending, outcome, send } = useInvitationMail(token);
  return (
    <Box gap={12}>
      <Row gap={8} align="flex-end" wrap>
        <Field.Root label={t('admin.invitationMailAddress')} flex={1} minW={200}>
          <Field.Input type="email" icon="mail" value={to} onValueChange={setTo} />
        </Field.Root>
        <Button
          size="sm"
          icon="send"
          label={t('admin.invitationMailSend')}
          loading={sending}
          disabled={!plausibleAddress(to)}
          onPress={() => void send(to)}
        />
      </Row>
      {outcome ? <Outcome outcome={outcome} /> : null}
    </Box>
  );
}

/** {@link InvitationMailForm} in a dialog of its own, for a list of
 * invitations. */
export function InvitationMailDialog({
  token,
  address,
  onClose,
}: Readonly<InvitationMailProps & { onClose: () => void }>) {
  const t = useT();
  return (
    <Dialog.Root open title={t('admin.invitationMailTitle')} onClose={onClose} width="md">
      <InvitationMailForm token={token} address={address} />
      <Dialog.Footer>
        <Dialog.Actions onCancel={onClose} cancelLabel={t('common.close')} />
      </Dialog.Footer>
    </Dialog.Root>
  );
}
