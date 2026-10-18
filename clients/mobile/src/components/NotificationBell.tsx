import {
  Box,
  radius as cornerRadius,
  Icon,
  IconButton,
  styles,
  Text,
  fontSizes as textSizes,
} from '@kromatv/ui/kit';
import { useRouter } from 'expo-router';
import { useT } from '#mobile/lib/i18n';
import { useUnreadCount } from '#mobile/lib/notifications';
import { type } from '#mobile/lib/theme';

export function NotificationBell() {
  const t = useT();
  const router = useRouter();
  const unread = useUnreadCount();

  return (
    <IconButton
      variant="ghost"
      diameter={40}
      glyph={22}
      hitSlop={10}
      label={unread > 0 ? t('notifications.unreadCount', { n: unread }) : t('notifications.title')}
      onPress={() => router.push('/notifications' as never)}
    >
      <Box>
        <Icon name="bell" size={22} thickness={2} />
        {unread > 0 ? (
          <Box style={s.badge}>
            {/* Past nine the pill starts outgrowing the bell. */}
            <Text style={s.count}>{unread > 9 ? '9+' : unread}</Text>
          </Box>
        ) : null}
      </Box>
    </IconButton>
  );
}

const s = styles({
  badge: {
    absolute: true,
    top: -5,
    right: -7,
    center: true,
    h: 16,
    minW: 16,
    px: 4,
    bg: 'accent',
    radius: cornerRadius.sm,
  },
  count: {
    ...type.small,
    fontSize: textSizes.micro,
    lineHeight: 14,
    fontWeight: '800',
    color: 'accentInk',
  },
});
