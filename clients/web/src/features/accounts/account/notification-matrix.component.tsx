import type { NotificationCategory, PrefsUpdate } from '@kromatv/client/notifications';
import {
  channelReach,
  NOTIFICATION_CATEGORY_LABEL,
  type PrefsSection,
  prefsSections,
  sectionSwitched,
  typeSwitched,
} from '@kromatv/core';
import { useT } from '@kromatv/ui';
import {
  Box,
  CONTROL,
  Focusable,
  Icon,
  type IconName,
  IconWell,
  ListRow,
  Skeleton,
  Surface,
  styles,
  sv,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CHANNELS, ChannelToggles } from '#web/features/accounts/account/channel-toggles.component';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const ROW = CONTROL.md;
const KIND_INDENT = 48;
const KIND_OUTDENT = 32;

const CATEGORY_ICON: Record<NotificationCategory, IconName> = {
  requests: 'inbox',
  media: 'sparkles',
  reports: 'flag',
  downloads: 'download',
  system: 'server',
};

const cover = sv({
  base: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    _hover: { bg: 'surface3' },
    _focus: { bg: 'accentSoft' },
  },
});

const sDefinition = styles({
  line: { rowGap: 10, columnGap: 14 },
  words: { minWidth: 150, flexGrow: 1, flexBasis: 150 },
  name: { fontSize: ROW.fontSize, lineHeight: ROW.line, fontWeight: '700' },
  kinds: { rowGap: 12 },
});

type Save = (key: string, update: PrefsUpdate) => void;

/** The account's delivery matrix: one row per category, saying for each
 * channel how many of its kinds arrive that way, and the kinds themselves once
 * the row is opened. */
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
    <ListRow.Group size="md">
      <ListRow.Root>
        <ListRow.Leading>
          <IconWell name="adjustments-horizontal" size="sm" tone="accent" />
        </ListRow.Leading>
        <ListRow.Label>{t('notifications.settings')}</ListRow.Label>
        <ListRow.Hint>{t('notifications.settingsHint')}</ListRow.Hint>
      </ListRow.Root>
      {prefsSections(data).map((section) => (
        <Category key={section.category.category} section={section} saving={saving} save={save} />
      ))}
    </ListRow.Group>
  );
}

function Category({
  section,
  saving,
  save,
}: Readonly<{ section: PrefsSection; saving: string | null; save: Save }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const [open, setOpen] = useState(false);
  const { category, types } = section;
  const name = t(NOTIFICATION_CATEGORY_LABEL[category.category]);
  const expands = types.length > 0;
  const mixed = CHANNELS.some((channel) => {
    const { on, of } = channelReach(section, channel);
    return on > 0 && on < of;
  });

  return (
    <>
      <Box row align="center" px={ROW.px} py={ROW.py} gap={ROW.gap} minH={ROW.height}>
        {expands ? (
          <Focusable
            sv={cover}
            ring="focusInset"
            label={t('notifications.kindsToggle', { category: name })}
            expanded={open}
            onPress={() => setOpen((was) => !was)}
          />
        ) : null}
        <Box pointerEvents="none">
          <IconWell name={CATEGORY_ICON[category.category]} size="sm" />
        </Box>
        <Box row wrap flex minW={0} align="center" pointerEvents="box-none" style={s.line}>
          <Box pointerEvents="none" style={s.words}>
            <Text style={s.name}>{name}</Text>
            {expands ? (
              <Text variant="meta" color="textDim">
                {t(mixed ? 'notifications.kindsMixed' : 'notifications.kinds', {
                  count: types.length,
                })}
              </Text>
            ) : null}
          </Box>
          <ChannelToggles
            name={name}
            reach={(channel) => channelReach(section, channel)}
            disabled={saving === category.category}
            onSwitch={(channel, on) =>
              save(category.category, sectionSwitched(section, channel, on))
            }
          />
        </Box>
        {expands ? (
          <Box pointerEvents="none">
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color="textMuted" />
          </Box>
        ) : null}
      </Box>
      {open ? (
        <Box
          px={ROW.px}
          pb={ROW.py + 4}
          pl={ROW.px + KIND_INDENT}
          pr={ROW.px + KIND_OUTDENT}
          style={s.kinds}
        >
          {types.map((type) => (
            <Box key={type.type} row wrap align="center" style={s.line}>
              <Text variant="meta" color="textMuted" style={s.words}>
                {type.label}
              </Text>
              <ChannelToggles
                name={type.label}
                reach={(channel) => ({ on: type[channel] ? 1 : 0, of: 1 })}
                disabled={saving === type.type || saving === category.category}
                onSwitch={(channel, on) => save(type.type, typeSwitched(type, { [channel]: on }))}
              />
            </Box>
          ))}
        </Box>
      ) : null}
    </>
  );
}
