// The sidebar's footer: who is signed in, and what this build is.

import buildInfo from 'virtual:build-info';
import { useT } from '@kroma/ui';
import { Box, Menu, type MenuTriggerBind, Text } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { type CSSProperties, type Ref, useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';
import { serverQueries } from '#web/shared/lib/queries';
import { UserAvatar } from '#web/shared/ui/user-avatar';

const TABULAR = { fontVariant: ['tabular-nums' as const] };
const NO_CAPS = { textTransform: 'none' } as const;

// A `title` tooltip and the UA's own button skin are browser concerns the kit
// has no name for, so the trigger stays an element around a kit row.
const CHIP_BUTTON: CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 8,
  padding: 0,
  border: 0,
  background: 'none',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

/** Client version + commit come from the build-time `virtual:build-info`
 *  module; the server version is the public `/api/health` endpoint. */
export function VersionInfo() {
  const t = useT();
  const { data: health } = useQuery(serverQueries.health());
  const clientTitle = `${buildInfo.commit}${buildInfo.dirty ? '-dirty' : ''} · ${buildInfo.branch} · ${buildInfo.buildDate}`;
  return (
    <Box row align="center" gap={6} px={2}>
      <span title={clientTitle}>
        <Text variant="overline" color="textDim" style={NO_CAPS}>
          {t('nav.versionClient')}{' '}
          <Text variant="overline" color="textDim" style={TABULAR}>
            {`v${buildInfo.version}`}
          </Text>
        </Text>
      </span>
      <Text variant="overline" color="textDim" opacity={0.4}>
        ·
      </Text>
      <Text variant="overline" color="textDim" style={NO_CAPS}>
        {t('nav.versionServer')}{' '}
        <Text variant="overline" color="textDim" style={TABULAR}>
          {health ? `v${health.version}` : '…'}
        </Text>
      </Text>
    </Box>
  );
}

/** The signed-in profile, and the account menu it opens. */
export function UserChip() {
  const t = useT();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  // Return to the current page after switching profile.
  const href = useRouterState({ select: (s) => s.location.href });
  if (!user) return null;
  return (
    <Menu.Root label={t('nav.account')} align="start">
      <Menu.Trigger render={userChipTrigger(user, t('nav.account'))} />
      <Menu.Item
        icon="user-circle"
        label={t('nav.accountSettings')}
        onSelect={() => void navigate({ to: '/account' })}
      />
      <Menu.Item
        icon="users"
        label={t('nav.changeProfile')}
        onSelect={() => void navigate({ to: '/login', search: { redirect: href } })}
      />
      <Menu.Separator />
      <Menu.Item
        icon="logout"
        label={t('auth.logout')}
        tone="danger"
        onSelect={() => void logout()}
      />
    </Menu.Root>
  );
}

// Built out here rather than inline in <UserChip>: a render prop is still a
// function returning elements, and one written inside the parent remounts its
// subtree on every render of it.
const userChipTrigger = (user: ChipUser, label: string) => (bind: MenuTriggerBind) => (
  <UserChipTrigger bind={bind} user={user} label={label} />
);

interface ChipUser {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

function UserChipTrigger({
  bind,
  user,
  label,
}: Readonly<{ bind: MenuTriggerBind; user: ChipUser; label: string }>) {
  const { ref, expanded, onPress } = bind;
  const [hovered, setHovered] = useState(false);
  return (
    <button
      ref={ref as unknown as Ref<HTMLButtonElement>}
      type="button"
      aria-haspopup="menu"
      aria-expanded={expanded}
      onClick={onPress}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={CHIP_BUTTON}
      title={label}
    >
      <Box
        row
        align="center"
        gap={12}
        p={10}
        radius="md"
        bg={expanded || hovered ? 'white/4' : undefined}
      >
        <UserAvatar
          name={user.username}
          avatarUrl={user.avatarUrl}
          seed={user.id}
          size={36}
          radius={10}
        />
        <Box minW={0}>
          <Text variant="label" lines={1}>
            {user.username}
          </Text>
          <Text variant="overline" color="textDim" style={NO_CAPS} lines={1}>
            {label}
          </Text>
        </Box>
      </Box>
    </button>
  );
}
