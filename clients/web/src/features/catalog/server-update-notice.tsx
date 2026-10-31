import { hasPermission } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Box, Focusable, Icon, IconButton, sv, Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '#web/shared/lib/auth';
import { RouteLink } from '#web/shared/ui/route-link';

const noticeStyle = sv({
  base: {
    row: true,
    align: 'center',
    gap: 8,
    px: 10,
    py: 5,
    minH: 36,
    radius: 'md',
    bg: 'tint/3',
    border: 'border',
    _hover: { bg: 'tint/6' },
    _focus: { bg: 'tint/6' },
    _press: { bg: 'tint/8' },
  },
});

/** Reads cached server discovery; this never starts a check or an install.
 * The Updates page requires settings.manage, so only those admins see it.
 * Use the same query as Admin to share refreshes and immediate post-update state.
 */
function useServerUpdateNotice() {
  const { user, client } = useAuth();
  const allowed = !!user && hasPermission(user, 'settings.manage');
  const { data } = useQuery({
    queryKey: ['admin', 'updates'],
    queryFn: () => client.admin.updates(),
    enabled: allowed,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  if (!allowed || !data) return null;
  const operation = data.operation;
  if (operation && !['complete', 'failed', 'deferred'].includes(operation.phase)) {
    return { version: operation.target.version, updating: true };
  }
  if (!data.available || !data.latest) return null;
  return { version: data.latest.version, updating: false };
}

/** A quiet, actionable notice in the main library sidebar, outside Admin. */
export function ServerUpdateNotice() {
  const t = useT();
  const notice = useServerUpdateNotice();
  if (!notice) return null;
  const label = notice.updating
    ? t('nav.serverUpdating')
    : t('admin.updateAvailable', { version: notice.version });
  return (
    <Box mt={8}>
      <span title={label}>
        <Focusable sv={noticeStyle} role="link" asChild>
          <RouteLink to="/admin/updates">
            <Icon name={notice.updating ? 'refresh' : 'download'} size={16} color="textMuted" />
            <Text variant="meta" color="text" flex lines={1}>
              {t(notice.updating ? 'nav.updateInProgress' : 'nav.updateAvailable')}
            </Text>
            <Box shrink={0} px={7} py={2} radius="sm" bg="tint/8">
              <Text variant="meta" color="textMuted">
                {t(notice.updating ? 'nav.updateProgress' : 'nav.updateReview')}
              </Text>
            </Box>
          </RouteLink>
        </Focusable>
      </span>
    </Box>
  );
}

/** The equivalent visible cue on phones, without opening the navigation drawer. */
export function ServerUpdateIndicator() {
  const t = useT();
  const notice = useServerUpdateNotice();
  if (!notice) return null;
  const label = notice.updating
    ? t('nav.serverUpdating')
    : t('admin.updateAvailable', { version: notice.version });
  return (
    <span title={label}>
      <IconButton
        variant="ghost"
        active
        diameter={40}
        radius="md"
        icon={notice.updating ? 'refresh' : 'download'}
        glyph={20}
        label={label}
        role="link"
        asChild
      >
        <RouteLink to="/admin/updates" />
      </IconButton>
    </span>
  );
}
