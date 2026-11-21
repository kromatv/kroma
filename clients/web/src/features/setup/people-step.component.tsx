import type { Invite, Permission } from '@kromatv/client/accounts';
import { PERMISSIONS } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Button, Callout, IconButton, ListRow, Menu } from '@kromatv/ui/kit';
import { useState } from 'react';
import { InvitationRights } from '#web/features/setup/invitation-rights.component';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';
import { useInvitations } from '#web/features/setup/use-invitations.hook';
import { InvitationMailDialog } from '#web/shared/ui/invitation-mail.component';

interface RowProps {
  invite: Invite;
  link: string;
  onMail: () => void;
  onEdit: () => void;
  onRevoke: () => void;
}

function useRights(rights: readonly Permission[]): string {
  const t = useT();
  return PERMISSIONS.filter((meta) => rights.includes(meta.key))
    .map((meta) => t(meta.labelKey))
    .join(' · ');
}

function InvitationMenu({ onMail, onEdit, onRevoke }: Readonly<Omit<RowProps, 'invite' | 'link'>>) {
  const t = useT();
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
      <Menu.Item icon="mail" label={t('setup.peopleMail')} onSelect={onMail} />
      <Menu.Item icon="pencil" label={t('setup.peopleRightsEdit')} onSelect={onEdit} />
      <Menu.Separator />
      <Menu.Item icon="trash" label={t('setup.peopleDelete')} tone="danger" onSelect={onRevoke} />
    </Menu.Root>
  );
}

function InvitationRow({ invite, link, onMail, onEdit, onRevoke }: Readonly<RowProps>) {
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
        <InvitationMenu onMail={onMail} onEdit={onEdit} onRevoke={onRevoke} />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

interface ListProps extends Pick<ReturnType<typeof useInvitations>, 'open' | 'linkOf' | 'revoke'> {
  onMail: (invite: Invite) => void;
  onEdit: (invite: Invite) => void;
}

function InvitationList({ open, linkOf, revoke, onMail, onEdit }: Readonly<ListProps>) {
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
          onMail={() => onMail(held)}
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

function MailDialog({ invite, onClose }: Readonly<{ invite: Invite | null; onClose: () => void }>) {
  if (!invite) {
    return null;
  }
  return <InvitationMailDialog token={invite.token} onClose={onClose} />;
}

function usePeople() {
  const invitations = useInvitations();
  const [editing, setEditing] = useState<Invite | null>(null);
  const [mailing, setMailing] = useState<Invite | null>(null);
  const save = (invite: Invite, rights: Permission[]) => {
    setEditing(null);
    void invitations.change(invite.token, rights);
  };
  return { ...invitations, editing, setEditing, mailing, setMailing, save };
}

function PeopleDialogs({ people }: Readonly<{ people: ReturnType<typeof usePeople> }>) {
  return (
    <>
      <RightsEditor
        invite={people.editing}
        onClose={() => people.setEditing(null)}
        onSave={people.save}
      />
      <MailDialog invite={people.mailing} onClose={() => people.setMailing(null)} />
    </>
  );
}

/** Who else watches here. Each invitation is a link, and the person who opens
 * it sets their own password. A link says what its account may do. The owner
 * changes those rights, has the server send the link by mail, or deletes it. */
export function PeopleStep({ onBack, onContinue }: Readonly<PeopleStepProps>) {
  const t = useT();
  const people = usePeople();
  return (
    <>
      <StepHeading title={t('setup.peopleTitle')} sub={t('setup.peopleSub')} />
      <StepBody>
        <InvitationList
          open={people.open}
          linkOf={people.linkOf}
          revoke={people.revoke}
          onMail={people.setMailing}
          onEdit={people.setEditing}
        />
        <InviteMore busy={people.busy} onInvite={() => void people.create()} />
      </StepBody>
      <StepActions onBack={onBack}>
        <Button
          size="md"
          label={t('setup.continue')}
          iconRight="arrow-right"
          onPress={onContinue}
        />
      </StepActions>
      <PeopleDialogs people={people} />
    </>
  );
}
