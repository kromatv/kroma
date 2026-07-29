// The bell in the app's chrome: how many notices are waiting, and the way in.
//
// Always present once signed in, badge or no badge - a control that appears only
// when there is news is a control nobody knows exists, and "where do I see what
// I missed" is a worse question than an empty list.

import { Icon, IconButton } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { useUnreadCount } from '#mobile/lib/notifications';
import { colors, type } from '#mobile/lib/theme';

export function NotificationBell() {
  const t = useT();
  const router = useRouter();
  const unread = useUnreadCount();

  return (
    <IconButton
      variant="ghost"
      size={40}
      glyph={22}
      hitSlop={10}
      label={unread > 0 ? t('notifications.unreadCount', { n: unread }) : t('notifications.title')}
      onPress={() => router.push('/notifications' as never)}
    >
      <View>
        <Icon name="bell" size={22} stroke={2} />
        {unread > 0 ? (
          <View style={styles.badge}>
            {/* Past nine the exact count stops being useful and the pill starts
                outgrowing the bell. */}
            <Text style={styles.count}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        ) : null}
      </View>
    </IconButton>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  count: {
    ...type.small,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    color: colors.accentInk,
  },
});
