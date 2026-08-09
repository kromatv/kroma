// Notification settings: push on THIS device, and the per-category matrix for
// the account. A push subscription belongs to one device; the categories
// travel with the account.

import type { CategoryPref, NotificationCategory, PushBlocker } from '@kroma/core';
import {
  blockerOf,
  disablePush,
  enablePush,
  NOTIFICATION_CATEGORY_LABEL,
  PUSH_BLOCKER_LABEL,
} from '@kroma/core';
import { Box, Switch, styles, Txt } from '@kroma/ui/kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView } from 'react-native';
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
      <ScrollView contentContainerStyle={s.body}>
        <Box style={s.card}>
          <Box style={s.pushRow}>
            <Box style={s.pushText}>
              <Txt style={s.rowLabel}>{t('push.title')}</Txt>
              <Txt style={s.hint}>{t('push.description')}</Txt>
            </Box>
            {blocker ? null : (
              <Pressable
                onPress={() => toggle.mutate()}
                disabled={toggle.isPending}
                style={({ pressed }) => [s.action, pressed && s.actionPressed]}
              >
                {toggle.isPending ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <Txt style={s.actionLabel}>
                    {subscribed ? t('push.disable') : t('push.enable')}
                  </Txt>
                )}
              </Pressable>
            )}
          </Box>
          {blocker ? <Txt style={s.notice}>{t(PUSH_BLOCKER_LABEL[blocker])}</Txt> : null}
          {error ? <Txt style={s.error}>{error}</Txt> : null}
        </Box>

        <Txt style={s.group}>{t('notifications.settings')}</Txt>
        <Box style={s.card}>
          <Box style={s.headerRow}>
            <Txt style={s.headerSpacer} />
            <Txt style={s.headerCell}>{t('notifications.channelInApp')}</Txt>
            <Txt style={s.headerCell}>{t('notifications.channelPush')}</Txt>
          </Box>
          {prefs.data?.categories.map((pref) => (
            <Box key={pref.category} style={s.row}>
              <Txt style={s.rowLabel}>{t(NOTIFICATION_CATEGORY_LABEL[pref.category])}</Txt>
              <Box style={s.cell}>
                <Switch
                  checked={pref.inApp}
                  onChange={(inApp) => setPref(pref.category, { inApp })}
                />
              </Box>
              <Box style={s.cell}>
                <Switch checked={pref.push} onChange={(push) => setPref(pref.category, { push })} />
              </Box>
            </Box>
          ))}
        </Box>
      </ScrollView>
    </Screen>
  );
}

const s = styles({
  body: { gap: spacing.sm, p: spacing.md, ...boxed(contentWidth.reading) },
  group: {
    ...type.small,
    px: 4,
    mt: spacing.md,
    mb: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: { px: 12, py: 8, bg: 'surface1', radius: radius.lg },
  pushRow: { row: true, align: 'flex-start', gap: spacing.sm },
  pushText: { flex: true, gap: 2 },
  hint: { ...type.small, color: 'textDim' },
  notice: { ...type.small, mt: spacing.sm, color: 'textDim', lineHeight: 18 },
  error: { ...type.small, mt: spacing.sm, color: '#ff8080' },
  action: { align: 'center', minW: 88, px: 14, py: 8, bg: 'accentSoft', radius: radius.md },
  actionPressed: { opacity: 0.7 },
  actionLabel: { ...type.small, color: 'accent', fontWeight: '600' },
  headerRow: { row: true, align: 'center', pb: 6 },
  headerSpacer: { flex: true },
  headerCell: {
    ...type.small,
    w: 64,
    color: 'textDim',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 10,
  },
  row: { row: true, align: 'center', py: 10 },
  rowLabel: { ...type.body, flex: true, color: 'text' },
  cell: { align: 'center', w: 64 },
});
