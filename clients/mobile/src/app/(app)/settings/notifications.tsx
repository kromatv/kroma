// Notification settings: push on THIS device, and the per-category matrix for
// the account.
//
// The split is worth being explicit about in the copy, because "why is my phone
// quiet but my laptop isn't" is otherwise a mystery: a push subscription belongs
// to one device, while the categories below travel with the account.

import type { CategoryPref, NotificationCategory, PushBlocker } from '@kroma/core';
import {
  blockerOf,
  disablePush,
  enablePush,
  NOTIFICATION_CATEGORY_LABEL,
  PUSH_BLOCKER_LABEL,
} from '@kroma/core';
import { Switch } from '@kroma/ui/kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '#mobile/components/PageHeader';
import { Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { nativePush } from '#mobile/lib/notifications/push';
import { useClient } from '#mobile/lib/session';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

export default function NotificationSettings() {
  const t = useT();
  const client = useClient();
  const qc = useQueryClient();
  const [blocker, setBlocker] = useState<PushBlocker | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reads native state, so it can only run on the device.
  useEffect(() => {
    void nativePush.blocker().then(setBlocker);
  }, []);

  const pushKey = useQuery({ queryKey: ['push-key'], queryFn: () => client.pushKey() });
  const prefs = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () => client.getNotificationPrefs(),
  });
  const subscribed = pushKey.data?.subscribed ?? false;

  const toggle = useMutation({
    mutationFn: async () => {
      if (subscribed) await disablePush(nativePush, client);
      else await enablePush(nativePush, client);
    },
    onSuccess: async () => {
      setError(null);
      // The permission answer may have changed what is possible.
      setBlocker(await nativePush.blocker());
      await qc.invalidateQueries({ queryKey: ['push-key'] });
    },
    onError: (e: Error) => {
      const reason = blockerOf(e);
      setError(reason ? t(PUSH_BLOCKER_LABEL[reason]) : t('push.failed'));
    },
  });

  const savePrefs = useMutation({
    mutationFn: (categories: CategoryPref[]) => client.setNotificationPrefs({ categories }),
    // The PUT returns the saved matrix, so seed the cache instead of refetching.
    onSuccess: (saved) => qc.setQueryData(['notification-prefs'], saved),
  });

  const setPref = (category: NotificationCategory, patch: Partial<CategoryPref>) => {
    if (!prefs.data) return;
    savePrefs.mutate(
      prefs.data.categories.map((c) => (c.category === category ? { ...c, ...patch } : c)),
    );
  };

  return (
    <Screen padded={false}>
      <PageHeader title={t('notifications.settings')} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <View style={styles.pushRow}>
            <View style={styles.pushText}>
              <Text style={styles.rowLabel}>{t('push.title')}</Text>
              <Text style={styles.hint}>{t('push.description')}</Text>
            </View>
            {blocker ? null : (
              <Pressable
                onPress={() => toggle.mutate()}
                disabled={toggle.isPending}
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              >
                {toggle.isPending ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <Text style={styles.actionLabel}>
                    {subscribed ? t('push.disable') : t('push.enable')}
                  </Text>
                )}
              </Pressable>
            )}
          </View>
          {blocker ? <Text style={styles.notice}>{t(PUSH_BLOCKER_LABEL[blocker])}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <Text style={styles.group}>{t('notifications.settings')}</Text>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.headerSpacer} />
            <Text style={styles.headerCell}>{t('notifications.channelInApp')}</Text>
            <Text style={styles.headerCell}>{t('notifications.channelPush')}</Text>
          </View>
          {prefs.data?.categories.map((pref) => (
            <View key={pref.category} style={styles.row}>
              <Text style={styles.rowLabel}>{t(NOTIFICATION_CATEGORY_LABEL[pref.category])}</Text>
              <View style={styles.cell}>
                <Switch
                  checked={pref.inApp}
                  onChange={(inApp) => setPref(pref.category, { inApp })}
                />
              </View>
              <View style={styles.cell}>
                <Switch checked={pref.push} onChange={(push) => setPref(pref.category, { push })} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.md, gap: spacing.sm, ...boxed(contentWidth.reading) },
  group: {
    ...type.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pushRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  pushText: { flex: 1, gap: 2 },
  hint: { ...type.small, color: colors.textFaint },
  notice: {
    ...type.small,
    color: colors.textFaint,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  error: { ...type.small, color: '#ff8080', marginTop: spacing.sm },
  action: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    minWidth: 88,
    alignItems: 'center',
  },
  actionPressed: { opacity: 0.7 },
  actionLabel: { ...type.small, color: colors.accent, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  headerSpacer: { flex: 1 },
  headerCell: {
    ...type.small,
    color: colors.textFaint,
    width: 64,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowLabel: { ...type.body, color: colors.text, flex: 1 },
  cell: { width: 64, alignItems: 'center' },
});
