import type { SessionInfo, SessionVia } from '@kromatv/client/accounts';
import type { MessageKey } from '@kromatv/i18n';
import { useFormat, useT } from '@kromatv/ui';
import {
  Badge,
  Box,
  Button,
  DataField,
  Icon,
  type IconName,
  ListRow,
  Row,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { useState } from 'react';
import { type DeviceKind, deviceInfo } from '#web/shared/lib/device';

const DEVICE_ICON: Record<DeviceKind, IconName> = {
  tv: 'device-tv',
  mobile: 'device-mobile',
  desktop: 'device-desktop',
};

const VIA: Record<SessionVia, MessageKey> = {
  lan: 'network.viaLan',
  vpn: 'network.viaVpn',
  tunnel: 'network.viaTunnel',
  internet: 'network.viaInternet',
};

const sDefinition = styles({
  facts: { rowGap: 16, columnGap: 28 },
  fact: { minWidth: 140, flexGrow: 1, flexBasis: 140 },
  agent: { wordBreak: 'break-all' },
});

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  const s = useStyles(sDefinition);
  return (
    <Box style={s.fact}>
      <DataField.Root size="sm">
        <DataField.Label>{label}</DataField.Label>
        <DataField.Value>{value}</DataField.Value>
      </DataField.Root>
    </Box>
  );
}

/** One signed-in device. The row says which device and when; pressing it opens
 * everything the server knows about it, and the way to sign it out. */
export function SessionRow({
  session,
  revoking,
  onRevoke,
}: Readonly<{ session: SessionInfo; revoking: boolean; onRevoke: () => void }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const { label, kind } = deviceInfo(session.userAgent, t('account.unknownDevice'));
  const unknown = t('account.sessionUnknown');
  const version = session.app
    ? t('account.appVersion', { version: session.app.version })
    : t('account.appVersionUnknown');
  const summary = [version, fmt.elapsed(session.lastSeen), session.address].filter(Boolean);

  return (
    <>
      <ListRow.Root
        label={t('account.sessionDetails', { device: label })}
        expanded={open}
        chevron={false}
        onPress={() => setOpen((was) => !was)}
      >
        <ListRow.Leading>
          <Box center w={38} h={38} radius="xs" border="border" bg="surface2">
            <Icon name={DEVICE_ICON[kind]} size={19} thickness={1.7} color="textMuted" />
          </Box>
        </ListRow.Leading>
        <Row wrap gap={8}>
          <ListRow.Label>{label}</ListRow.Label>
          {session.current ? <Badge tone="success">{t('account.thisDevice')}</Badge> : null}
          {session.outdated ? <Badge tone="warning">{t('account.appOutdated')}</Badge> : null}
        </Row>
        <ListRow.Hint>{summary.join(' · ')}</ListRow.Hint>
        <ListRow.Trailing>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color="textMuted" />
        </ListRow.Trailing>
      </ListRow.Root>
      {open ? (
        <ListRow.Root>
          <Box flex minW={0} gap={18} py={4}>
            <Box row wrap style={s.facts}>
              <Fact label={t('account.sessionDevice')} value={label} />
              <Fact
                label={t('account.sessionApp')}
                value={session.app ? `${session.app.shell} ${session.app.version}` : unknown}
              />
              <Fact label={t('account.sessionAddress')} value={session.address ?? unknown} />
              <Fact
                label={t('account.sessionVia')}
                value={session.via ? t(VIA[session.via]) : unknown}
              />
              <Fact
                label={t('account.sessionSignedIn')}
                value={fmt.stamp(session.createdAt) ?? unknown}
              />
              <Fact
                label={t('account.sessionLastActive')}
                value={fmt.stamp(session.lastSeen) ?? unknown}
              />
            </Box>
            <Box gap={4}>
              <Text variant="overline" color="textDim">
                {t('account.sessionUserAgent')}
              </Text>
              <Text variant="meta" color="textMuted" selectable style={s.agent}>
                {session.userAgent ?? unknown}
              </Text>
            </Box>
            {session.current ? null : (
              <Box align="flex-start">
                <Button
                  variant="dangerGhost"
                  size="sm"
                  icon="logout"
                  label={t('account.signOutThisDevice')}
                  onPress={onRevoke}
                  loading={revoking}
                />
              </Box>
            )}
          </Box>
        </ListRow.Root>
      ) : null}
    </>
  );
}
