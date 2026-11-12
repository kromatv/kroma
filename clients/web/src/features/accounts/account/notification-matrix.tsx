import type { PrefsUpdate } from '@kromatv/client/notifications';
import {
  categorySwitched,
  NOTIFICATION_CATEGORY_LABEL,
  type PrefsSection,
  prefsSections,
  typeSwitched,
} from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, ListRow, Skeleton, Surface, Switch, Text } from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useWebRuntime } from '#web/shared/lib/web-runtime';

// The two channel columns must line up with the switches under them, and a
// switch is one shell step wide.
const CHANNEL_COLUMN = 46;

interface Channels {
  name: string;
  inApp: boolean;
  push: boolean;
  disabled: boolean;
  onInApp: (inApp: boolean) => void;
  onPush: (push: boolean) => void;
}

/** The account's delivery matrix: each category, then every kind of
 * notification under it, each with an in-app and a push switch. */
export function NotificationMatrix() {
  const webRuntime = useWebRuntime();
  const t = useT();
  const qc = useQueryClient();
  const query = webRuntime.queries.userQueries.notificationPrefs();
  const { data, isPending } = useQuery(query);
  const [saving, setSaving] = useState<string | null>(null);

  const save = async (key: string, update: PrefsUpdate) => {
    setSaving(key);
    try {
      const saved = await webRuntime.client.notifications.setPrefs(update);
      qc.setQueryData(query.queryKey, saved);
    } finally {
      setSaving(null);
    }
  };

  if (isPending || !data) {
    return (
      <Surface elevated pad="none" p={22} radius="xl" border="border">
        <Skeleton h={128} radius="sm" />
      </Surface>
    );
  }

  return (
    <Box gap={12}>
      <ListRow.Group size="md">
        <ListRow.Root>
          <ListRow.Label>{t('notifications.settings')}</ListRow.Label>
          <ListRow.Trailing>
            <ChannelHead label={t('notifications.channelInApp')} />
            <ChannelHead label={t('notifications.channelPush')} />
          </ListRow.Trailing>
        </ListRow.Root>
      </ListRow.Group>
      {prefsSections(data).map((section) => (
        <Section key={section.category.category} section={section} saving={saving} save={save} />
      ))}
    </Box>
  );
}

function Section({
  section,
  saving,
  save,
}: Readonly<{
  section: PrefsSection;
  saving: string | null;
  save: (key: string, update: PrefsUpdate) => void;
}>) {
  const t = useT();
  const { category, types } = section;
  return (
    <ListRow.Group size="md">
      <ListRow.Root>
        <ListRow.Label>{t(NOTIFICATION_CATEGORY_LABEL[category.category])}</ListRow.Label>
        {types.length > 0 ? <ListRow.Hint>{t('notifications.categoryHint')}</ListRow.Hint> : null}
        <ListRow.Trailing>
          <ChannelSwitches
            name={t(NOTIFICATION_CATEGORY_LABEL[category.category])}
            inApp={category.inApp}
            push={category.push}
            disabled={saving === category.category}
            onInApp={(inApp) => save(category.category, categorySwitched(category, { inApp }))}
            onPush={(push) => save(category.category, categorySwitched(category, { push }))}
          />
        </ListRow.Trailing>
      </ListRow.Root>
      {types.map((type) => (
        <ListRow.Root key={type.type}>
          <ListRow.Label>{type.label}</ListRow.Label>
          <ListRow.Trailing>
            <ChannelSwitches
              name={type.label}
              inApp={type.inApp}
              push={type.push}
              disabled={saving === type.type}
              onInApp={(inApp) => save(type.type, typeSwitched(type, { inApp }))}
              onPush={(push) => save(type.type, typeSwitched(type, { push }))}
            />
          </ListRow.Trailing>
        </ListRow.Root>
      ))}
    </ListRow.Group>
  );
}

function ChannelSwitches({ name, inApp, push, disabled, onInApp, onPush }: Readonly<Channels>) {
  const t = useT();
  return (
    <>
      <Switch
        label={`${name} · ${t('notifications.channelInApp')}`}
        checked={inApp}
        disabled={disabled}
        onCheckedChange={onInApp}
      />
      <Switch
        label={`${name} · ${t('notifications.channelPush')}`}
        checked={push}
        disabled={disabled}
        onCheckedChange={onPush}
      />
    </>
  );
}

function ChannelHead({ label }: Readonly<{ label: string }>) {
  return (
    <Box w={CHANNEL_COLUMN} align="center">
      <Text variant="overline" color="textDim" textAlign="center">
        {label}
      </Text>
    </Box>
  );
}
