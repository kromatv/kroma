import { type AdminUser, resolveImageUrl } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Avatar,
  Box,
  Button,
  type ColorValue,
  EmptyState,
  Grid,
  IconButton,
  Section,
  StatCard,
  Text,
} from '@kroma/ui/kit';
import { Pill, PillDot } from '#web/features/admin/pill';
import { Denied, PageHeader, useCap, usePoll } from '#web/features/admin/shell';
import { Table } from '#web/features/admin/table';
import { EditUserModal, InviteModal, PendingInvite } from '#web/features/admin/users-modals';
import { relativeSeen } from '#web/shared/lib/adminFormat';
import { apiBase } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';

// Roles arrive already localized from the server (Accept-Language synced), so we
// match both locale spellings to keep the accent color right regardless of UI lang.
function roleStyle(role: string): { ink: ColorValue; bg: ColorValue } {
  if (role === 'Propriétaire' || role === 'Owner')
    return { ink: 'accentText', bg: 'accentWash/16' };
  if (role === 'Restreint' || role === 'Restricted') return { ink: 'info', bg: 'info/14' };
  return { ink: 'success', bg: 'success/14' };
}

export function UsersScreen() {
  if (!useCap('users.manage')) return <Denied />;
  return <UsersPageInner />;
}

function UsersPageInner() {
  const t = useT();
  const { client } = useAuth();
  const { data, reload } = usePoll(['admin', 'users'], () => client.adminUsers(), 8000);
  const { data: invitesData, reload: reloadInvites } = usePoll(
    ['admin', 'invites'],
    () => client.invites(),
    15000,
  );
  const openInvite = async () => {
    if (await InviteModal.call()) reloadInvites();
  };
  const openEdit = async (user: AdminUser) => {
    if (await EditUserModal.call({ user })) reload();
  };

  const users = data?.users ?? [];
  const libraryCount = data?.libraryCount ?? 0;
  const invites = invitesData ?? [];
  const online = users.filter((u) => u.online).length;

  return (
    <>
      <PageHeader.Root
        title={t('admin.usersTitle')}
        subtitle={t('admin.usersSub')}
        actions={
          <Button icon="plus" label={t('nav.inviteUser')} onPress={() => void openInvite()} />
        }
      />

      <Box mt={24}>
        <Grid min={200} gap={16}>
          <StatCard
            label={t('admin.statUsers')}
            value={users.length}
            unit={t('admin.statAccounts')}
          />
          <StatCard
            label={t('admin.statOnline')}
            value={online}
            unit={t('admin.statNow')}
            color="success"
          />
          <StatCard
            label={t('admin.statInvites')}
            value={invites.length}
            unit={t('admin.statPending')}
            color="accent"
          />
        </Grid>
      </Box>

      <Section.Root title={t('admin.membersSharing')} mt={28}>
        <Table.Root columns="2.4fr 1fr 1.3fr 1.2fr 44px">
          <Table.Header>
            <Table.Column>{t('admin.colUser')}</Table.Column>
            <Table.Column wide>{t('admin.colRole')}</Table.Column>
            <Table.Column wide>{t('admin.colAccess')}</Table.Column>
            <Table.Column wide>{t('admin.colLastActivity')}</Table.Column>
            <Table.Cell />
          </Table.Header>
          {users.map((u) => {
            const rs = roleStyle(u.role);
            const access =
              u.role === 'Propriétaire' || u.role === 'Owner'
                ? t('admin.allLibraries')
                : t('admin.libraryCount', { count: libraryCount });
            return (
              <Table.Row key={u.id}>
                <Table.Cell row gap={14}>
                  <Avatar
                    name={u.username}
                    src={resolveImageUrl(apiBase(), u.avatarUrl)}
                    size={42}
                    circle
                    shadow={false}
                  />
                  <Box minW={0}>
                    <Text variant="label" lines={1}>
                      {u.username}
                    </Text>
                    <Text variant="meta" color="textDim" lines={1}>
                      {u.email}
                    </Text>
                  </Box>
                </Table.Cell>
                <Table.Cell wide>
                  <Pill ink={rs.ink} bg={rs.bg}>
                    {u.role}
                  </Pill>
                </Table.Cell>
                <Table.Cell wide>
                  <Text variant="meta" color="textMuted">
                    {access}
                  </Text>
                </Table.Cell>
                <Table.Cell wide row gap={8}>
                  <PillDot tone={u.online ? 'success' : 'text/30'} size={7} />
                  <Text variant="meta" color="textDim">
                    {u.online ? t('admin.online') : relativeSeen(u.lastSeen)}
                  </Text>
                </Table.Cell>
                <Table.Cell row justify="flex-end">
                  <IconButton
                    variant="ghost"
                    icon="dots"
                    label={t('admin.editUserAction')}
                    onPress={() => void openEdit(u)}
                  />
                </Table.Cell>
              </Table.Row>
            );
          })}
          {data && users.length === 0 ? (
            <EmptyState.Root
              icon="users"
              title={t('admin.usersEmpty')}
              hint={t('admin.usersEmptyHint')}
              actions={
                <Button icon="plus" label={t('nav.inviteUser')} onPress={() => void openInvite()} />
              }
            />
          ) : null}
        </Table.Root>
      </Section.Root>

      {invites.length > 0 ? (
        <Section.Root title={t('admin.pendingInvites')} mt={28}>
          <Box gap={12}>
            {invites.map((inv) => (
              <PendingInvite key={inv.token} inv={inv} onChange={reloadInvites} />
            ))}
          </Box>
        </Section.Root>
      ) : null}
    </>
  );
}
