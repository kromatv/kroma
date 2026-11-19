import type { Invite, Permission } from '@kromatv/client/accounts';
import { PERMISSIONS } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Button, Callout, IconButton, ListRow, Menu } from '@kromatv/ui/kit';
import { useState } from 'react';
import { InvitationRights } from '#web/features/setup/invitation-rights.component';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';
import { invitationMail, useInvitations } from '#web/features/setup/use-invitations.hook';

interface RowProps {
  invite: Invite;
  link: string;
  onEdit: () => void;
  onRevoke: () => void;
}

function useRights(rights: readonly Permission[]): string {
  const t = useT();
  return PERMISSIONS.filter((meta) => rights.includes(meta.key))
    .map((meta) => t(meta.labelKey))
    .join(' · ');
}

function useMailTo(link: string): string {
  const t = useT();
  return invitationMail({
    subject: t('setup.peopleMailSubject'),
    body: t('setup.peopleMailBody', { link }),
  });
}

function InvitationMenu({ link, onEdit, onRevoke }: Readonly<Omit<RowProps, 'invite'>>) {
  const t = useT();
  const mail = useMailTo(link);
  return (
    <Menu.Root label={t('setup.peopleMore')} align="end">
      <Menu.Trigger
        render={(bind) => (
          <IconButton
            ref={bind.ref}
            variant="ghost"
            diameter={32}
            glyph={16}
            icon="dots"
            label={t('setup.peopleMore')}
            onPress={bind.onPress}
          />
        )}
      />
      <Menu.Item
        icon="mail"
        label={t('setup.peopleMail')}
        onSelect={() => window.location.assign(mail)}
      />
      <Menu.Item icon="pencil" label={t('setup.peopleRightsEdit')} onSelect={onEdit} />
      <Menu.Separator />
      <Menu.Item icon="trash" label={t('setup.peopleDelete')} tone="danger" onSelect={onRevoke} />
    </Menu.Root>
  );
}

function InvitationRow({ invite, link, onEdit, onRevoke }: Readonly<RowProps>) {
  const t = useT();
  const rights = useRights(invite.permissions);
  return (
    <ListRow.Root icon="link" label={rights} chevron={false}>
      <ListRow.Label>{rights}</ListRow.Label>
      <ListRow.Hint lines={1}>{link}</ListRow.Hint>
      <ListRow.Trailing>
        <IconButton
          variant="ghost"
          diameter={32}
          glyph={16}
          icon="copy"
          label={t('setup.peopleCopy')}
          onPress={() => void navigator.clipboard.writeText(link)}
        />
        <InvitationMenu link={link} onEdit={onEdit} onRevoke={onRevoke} />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

interface ListProps extends Pick<ReturnType<typeof useInvitations>, 'open' | 'linkOf' | 'revoke'> {
  onEdit: (invite: Invite) => void;
}

function InvitationList({ open, linkOf, revoke, onEdit }: Readonly<ListProps>) {
  if (open.length === 0) {
    return null;
  }
  return (
    <ListRow.Group>
      {open.map((held) => (
        <InvitationRow
          key={held.token}
          invite={held}
          link={linkOf(held)}
          onEdit={() => onEdit(held)}
          onRevoke={() => void revoke(held.token)}
        />
      ))}
    </ListRow.Group>
  );
}

function InviteMore({ busy, onInvite }: Readonly<{ busy: boolean; onInvite: () => void }>) {
  const t = useT();
  return (
    <>
      <Button
        variant="outline"
        size="md"
        icon="user-plus"
        label={t('setup.peopleInvite')}
        loading={busy}
        onPress={onInvite}
      />
      <Callout.Root tone="neutral" icon="eye" size="sm">
        <Callout.Title>{t('setup.peopleRightsTitle')}</Callout.Title>
        <Callout.Detail>{t('setup.peopleRightsDetail')}</Callout.Detail>
      </Callout.Root>
    </>
  );
}

interface EditorProps {
  invite: Invite | null;
  onClose: () => void;
  onSave: (invite: Invite, rights: Permission[]) => void;
}

function RightsEditor({ invite, onClose, onSave }: Readonly<EditorProps>) {
  if (!invite) {
    return null;
  }
  return (
    <InvitationRights
      rights={invite.permissions}
      onClose={onClose}
      onSave={(rights) => onSave(invite, rights)}
    />
  );
}

interface PeopleStepProps {
  onBack: () => void;
  onContinue: () => void;
}

/** Who else watches here. Each invitation is a link, and the person who opens
 * it sets their own password. A link says what its account may do. The owner
 * changes those rights, sends the link by mail, or deletes it. */
export function PeopleStep({ onBack, onContinue }: Readonly<PeopleStepProps>) {
  const t = useT();
  const { open, busy, create, revoke, change, linkOf } = useInvitations();
  const [editing, setEditing] = useState<Invite | null>(null);
  const save = (invite: Invite, rights: Permission[]) => {
    setEditing(null);
    void change(invite.token, rights);
  };
  return (
    <>
      <StepHeading title={t('setup.peopleTitle')} sub={t('setup.peopleSub')} />
      <StepBody>
        <InvitationList open={open} linkOf={linkOf} revoke={revoke} onEdit={setEditing} />
        <InviteMore busy={busy} onInvite={() => void create()} />
      </StepBody>
      <StepActions onBack={onBack}>
        <Button
          size="md"
          label={t('setup.continue')}
          iconRight="arrow-right"
          onPress={onContinue}
        />
      </StepActions>
      <RightsEditor invite={editing} onClose={() => setEditing(null)} onSave={save} />
    </>
  );
}
