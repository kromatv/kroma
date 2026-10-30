import { useWebRuntime } from '#web/shared/lib/web-runtime';
// The sidebar's footer: who is signed in, and what this build is.

import buildInfo from 'virtual:build-info';
import { useT } from '@kromatv/ui';
import { Box, classes, Menu, type MenuTriggerBind, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { type Ref, useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';

import { useFocusRing } from '#web/shared/lib/use-focus-ring';
import { RouteLink } from '#web/shared/ui/route-link';
import { UserAvatar } from '#web/shared/ui/user-avatar';

// A `title` tooltip and the UA's own button skin are browser concerns the kit
// has no name for, so the trigger stays an element around a kit row.
// The focus ring is an outline, which takes the corners of the element it is
// on: the button has to carry the surface's own radius, or it rings the row as a
// square. The gap above is a margin for the same reason, so the box the outline
// traces is the box the eye sees.
const sDefinition = styles({
  tabular: { fontVariant: ['tabular-nums'] },
  versionTooltip: { display: 'flex', minWidth: 0 },
  noCaps: { textTransform: 'none' },
  chipButton: {
    display: 'block',
    width: '100%',
    mt: 8,
    p: 0,
    borderWidth: 0,
    borderRadius: 'var(--radius-md)',
    bg: 'transparent',
    backgroundImage: 'none',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
  },
});

/** Client version + commit come from the build-time `virtual:build-info`
 *  module; the server version is the public `/api/health` endpoint. */
export function VersionInfo() {
  const webRuntime = useWebRuntime();

  const s = useStyles(sDefinition);

  const t = useT();
  const { data: health } = useQuery(webRuntime.queries.serverQueries.health());
  const clientTitle = `${buildInfo.commit}${buildInfo.dirty ? '-dirty' : ''} · ${buildInfo.branch} · ${buildInfo.buildDate}`;
  const serverVersion = health ? `v${health.version}` : '…';
  return (
    <Box row align="center" gap={6} px={2}>
      <Box flex minW={0}>
        <span title={clientTitle} className={classes(s.versionTooltip)}>
          <Text variant="meta" color="textDim" lines={1} style={s.tabular}>
            {`${t('nav.versionClient')} v${buildInfo.version}`}
          </Text>
        </span>
      </Box>
      <Text variant="meta" color="textDim" opacity={0.4}>
        ·
      </Text>
      <Box flex minW={0}>
        <Text variant="meta" color="textDim" lines={1} textAlign="right" style={s.tabular}>
          {`${t('nav.versionServer')} ${serverVersion}`}
        </Text>
      </Box>
    </Box>
  );
}

/** The signed-in profile, and the account menu it opens. */
export function UserChip() {
  const t = useT();
  const { user, logout } = useAuth();
  // Return to the current page after switching profile.
  const href = useRouterState({ select: (s) => s.location.href });
  if (!user) return null;
  return (
    <Menu.Root label={t('nav.account')} align="start">
      <Menu.Trigger render={userChipTrigger(user, t('nav.account'))} />
      <Menu.Item icon="user-circle" label={t('nav.accountSettings')} asChild>
        <RouteLink to="/account" />
      </Menu.Item>
      <Menu.Item icon="sparkles" label={t('releases.title')} asChild>
        <RouteLink to="/whats-new" />
      </Menu.Item>
      <Menu.Item icon="users" label={t('nav.changeProfile')} asChild>
        <RouteLink to="/login" search={{ redirect: href }} />
      </Menu.Item>
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
  const s = useStyles(sDefinition);

  const { ref, expanded, onPress } = bind;
  const [hovered, setHovered] = useState(false);
  const focus = useFocusRing(s.chipButton, 'focusLift');
  return (
    <button
      ref={ref as unknown as Ref<HTMLButtonElement>}
      type="button"
      aria-haspopup="menu"
      aria-expanded={expanded}
      onClick={onPress}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...focus.bind}
      className={focus.className}
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
        <UserAvatar name={user.username} avatarUrl={user.avatarUrl} seed={user.id} size={36} />
        <Box minW={0}>
          <Text variant="label" lines={1}>
            {user.username}
          </Text>
          <Text variant="overline" color="textDim" style={s.noCaps} lines={1}>
            {label}
          </Text>
        </Box>
      </Box>
    </button>
  );
}
