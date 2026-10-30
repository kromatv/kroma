// One line of the drawer. Two controls sit on it, siblings and never one inside
// the other: the notification itself, and the read/unread toggle. The kit's rule
// that a row is ONE focus stop is about a row that is one control and whose
// indicator reflects its own state (DESIGN.md §2); a notification is an object
// with a destination AND a piece of state the reader must be able to change
// without going there, which is two verbs and so two controls. They are
// siblings, the way <SelectRow> and its trash button are in the player's
// subtitles panel, so neither swallows the other's press.
//
// The row spans the whole line and the toggle is laid OVER its right end, rather
// than the two sharing the width: a focus ring belongs around the notification,
// and a row holding only the left two thirds of the line cannot draw one.

import type { Notification, NotificationId } from '@kromatv/client/notifications';
import { notificationUpdatedAt, sizedImageUrl } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import {
  Badge,
  Box,
  classes,
  Icon,
  IconButton,
  ListRow,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { notificationLink } from '#web/features/notifications/notification-link';
import { useRelativeTime, useStandaloneTime } from '#web/features/notifications/notification-time';
import { useReadState } from '#web/features/notifications/use-notifications';
import { NotificationCard } from '#web/shared/ui/notification-card';

function foldLabels(
  one: Notification,
  latest: string,
  relative: (at: number) => string,
  t: Translate,
): { span: string | null; repeat: string | null } {
  if (one.count <= 1) return { span: null, repeat: null };
  const oldest = relative(one.createdAt);
  return {
    span: oldest === latest ? null : t('notifications.repeatSpan', { first: oldest, last: latest }),
    repeat: t('notifications.repeatCount', { count: one.count }),
  };
}

function settledLabel(one: Notification, t: Translate): string | null {
  if (!one.resolved) return null;
  const by = one.resolvedBy?.name;
  return by ? t('notifications.resolvedBy', { user: by }) : t('notifications.resolved');
}

export function NotificationEntry({
  one,
  onNavigate,
}: Readonly<{ one: Notification; onNavigate: () => void }>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const navigate = useNavigate();
  const relative = useRelativeTime();
  const standalone = useStandaloneTime();
  const { markRead } = useReadState();

  const unread = !one.read;
  const at = notificationUpdatedAt(one);
  const latest = relative(at);
  const { span, repeat } = foldLabels(one, latest, relative, t);
  const settled = settledLabel(one, t);

  function go() {
    markRead([one.id]);
    const href = notificationLink(one);
    if (href) {
      onNavigate();
      void navigate({ href });
    }
  }

  return (
    <Box bg={unread ? 'accent/6' : 'transparent'}>
      <Box>
        <ListRow.Root
          size="sm"
          label={[one.title, repeat, settled, span].filter(Boolean).join(' · ')}
          onPress={go}
          chevron={false}
          style={s.rowPad}
        >
          <NotificationCard
            event={one.event}
            src={one.imageUrl ? sizedImageUrl(one.imageUrl, 96) : null}
            unread={unread}
            title={one.title}
            titleTone={unread ? 'text' : 'textMuted'}
            body={one.body}
            repeat={repeat ? <Badge tone={unread ? 'warning' : 'neutral'}>{repeat}</Badge> : null}
            meta={
              settled || span ? (
                <Text variant="meta" color="textDim" lines={1} mt={3}>
                  {[settled, span].filter(Boolean).join(' · ')}
                </Text>
              ) : null
            }
            time={
              <time dateTime={new Date(at).toISOString()} className={classes(s.tabular)}>
                {standalone(at)}
              </time>
            }
          />
        </ListRow.Root>
        <Box absolute right={6} top={0} bottom={0} justify="center">
          <ReadToggle unread={unread} title={one.title} ids={[one.id]} />
        </Box>
      </Box>
    </Box>
  );
}

function ReadToggle({
  unread,
  title,
  ids,
}: Readonly<{ unread: boolean; title: string; ids: NotificationId[] }>) {
  const t = useT();
  const { markRead, markUnread } = useReadState();
  return (
    <IconButton
      variant="ghost"
      diameter={34}
      // The card it sits in draws its rings inward, which on a 34px disc lands
      // the ring inside the glyph. This one has room at the card's edge, so it
      // takes the ring on its own boundary instead.
      ring="focusEdge"
      active={unread}
      label={`${t(unread ? 'notifications.markRead' : 'notifications.markUnread')} · ${title}`}
      onPress={() => (unread ? markRead(ids) : markUnread(ids))}
    >
      <Icon
        name={unread ? 'circle-filled' : 'circle'}
        size={13}
        color={unread ? 'accentText' : 'textDim'}
      />
    </IconButton>
  );
}

// Room at the right for the toggle laid over the row, so a long title ellipses
// before it reaches the button rather than running under it.
const sDefinition = styles({
  rowPad: { pl: 8, pr: 46 },
  tabular: { fontVariantNumeric: 'tabular-nums' },
});
