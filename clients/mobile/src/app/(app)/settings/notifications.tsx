import {
  activeTheme,
  Box,
  color,
  Switch,
  styles,
  Text,
  fontSizes as textSizes,
  useStyleScope,
  useStyles,
  useThemeVersion,
} from '@kromatv/ui/kit';

// Notification settings: push on THIS device, and the delivery matrix for the
// account. A push subscription belongs to one device; the categories and the
// kinds under them travel with the account.

import {
  disablePush,
  enablePush,
  type PrefsUpdate,
  type PushBlocker,
} from '@kromatv/client/notifications';
import {
  blockerOf,
  categorySwitched,
  NOTIFICATION_CATEGORY_LABEL,
  PUSH_BLOCKER_LABEL,
  prefsSections,
  typeSwitched,
} from '@kromatv/core';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { PageHeader } from '#mobile/components/PageHeader';
import { Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { boxed, contentWidth } from '#mobile/lib/layout';
import { createNativePush } from '#mobile/lib/notifications/push';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';

export default function NotificationSettings() {
  const scope = useStyleScope();
  useThemeVersion();

  const s = useStyles(sDefinition);

  const t = useT();
  const nativePush = useMemo(() => createNativePush(t), [t]);
  const client = useClient();
  const qc = useQueryClient();
  const [blocker, setBlocker] = useState<PushBlocker | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reads native state, so it can only run on the device.
  useEffect(() => {
    void nativePush.blocker().then(setBlocker);
  }, [nativePush]);

  const pushKeyQuery = client.query.notifications.push.key();
  const prefsQuery = client.query.notifications.prefs();
  const pushKey = useQuery(pushKeyQuery);
  const prefs = useQuery(prefsQuery);
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
      await qc.invalidateQueries({ queryKey: pushKeyQuery.queryKey });
    },
    onError: (e: Error) => {
      const reason = blockerOf(e);
      setError(reason ? t(PUSH_BLOCKER_LABEL[reason]) : t('push.failed'));
    },
  });

  const savePrefs = useMutation({
    mutationFn: (update: PrefsUpdate) => client.notifications.setPrefs(update),
    // The PUT returns the saved matrix, so seed the cache instead of refetching.
    onSuccess: (saved) => qc.setQueryData(prefsQuery.queryKey, saved),
  });

  return (
    <Screen padded={false}>
      <PageHeader title={t('notifications.settings')} />
      <ScrollView contentContainerStyle={s.body}>
        <Box style={s.card}>
          <Box style={s.pushRow}>
            <Box style={s.pushText}>
              <Text style={s.rowLabel}>{t('push.title')}</Text>
              <Text style={s.hint}>{t('push.description')}</Text>
            </Box>
            {blocker ? null : (
              <Pressable
                onPress={() => toggle.mutate()}
                disabled={toggle.isPending}
                style={({ pressed }) => [s.action, pressed && s.actionPressed]}
              >
                {toggle.isPending ? (
                  <ActivityIndicator color={color('text', activeTheme(scope.theme))} size="small" />
                ) : (
                  <Text style={s.actionLabel}>
                    {subscribed ? t('push.disable') : t('push.enable')}
                  </Text>
                )}
              </Pressable>
            )}
          </Box>
          {blocker ? <Text style={s.notice}>{t(PUSH_BLOCKER_LABEL[blocker])}</Text> : null}
          {error ? <Text style={s.error}>{error}</Text> : null}
        </Box>

        <Text style={s.group}>{t('notifications.settings')}</Text>
        <Box style={s.headerRow}>
          <Text style={s.headerSpacer} />
          <Text style={s.headerCell}>{t('notifications.channelInApp')}</Text>
          <Text style={s.headerCell}>{t('notifications.channelPush')}</Text>
        </Box>
        {prefs.data
          ? prefsSections(prefs.data).map(({ category, types }) => (
              <Box key={category.category} style={s.card}>
                <Box style={s.row}>
                  <Box style={s.rowText}>
                    <Text style={s.rowLabel}>
                      {t(NOTIFICATION_CATEGORY_LABEL[category.category])}
                    </Text>
                    {types.length > 0 ? (
                      <Text style={s.hint}>{t('notifications.categoryHint')}</Text>
                    ) : null}
                  </Box>
                  <Box style={s.cell}>
                    <Switch
                      checked={category.inApp}
                      onCheckedChange={(inApp) =>
                        savePrefs.mutate(categorySwitched(category, { inApp }))
                      }
                    />
                  </Box>
                  <Box style={s.cell}>
                    <Switch
                      checked={category.push}
                      onCheckedChange={(push) =>
                        savePrefs.mutate(categorySwitched(category, { push }))
                      }
                    />
                  </Box>
                </Box>
                {types.map((type) => (
                  <Box key={type.type} style={s.row}>
                    <Box style={s.rowText}>
                      <Text style={s.typeLabel}>{type.label}</Text>
                    </Box>
                    <Box style={s.cell}>
                      <Switch
                        checked={type.inApp}
                        onCheckedChange={(inApp) => savePrefs.mutate(typeSwitched(type, { inApp }))}
                      />
                    </Box>
                    <Box style={s.cell}>
                      <Switch
                        checked={type.push}
                        onCheckedChange={(push) => savePrefs.mutate(typeSwitched(type, { push }))}
                      />
                    </Box>
                  </Box>
                ))}
              </Box>
            ))
          : null}
      </ScrollView>
    </Screen>
  );
}

const sDefinition = styles({
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
  error: { ...type.small, mt: spacing.sm, color: 'dangerHover' },
  action: { align: 'center', minW: 88, px: 14, py: 8, bg: 'accentSoft', radius: radius.md },
  actionPressed: { opacity: 0.7 },
  actionLabel: { ...type.small, color: 'accentText', fontWeight: '600' },
  headerRow: { row: true, align: 'center', px: 12 },
  headerSpacer: { flex: true },
  headerCell: {
    ...type.small,
    w: 64,
    color: 'textDim',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: textSizes.micro,
  },
  row: { row: true, align: 'center', py: 10 },
  rowText: { flex: true, gap: 2 },
  rowLabel: { ...type.body, color: 'text' },
  typeLabel: { ...type.body, color: 'textDim' },
  cell: { align: 'center', w: 64 },
});
