import { Denied, ModuleFailed, ModuleLoading, useCap, useT } from '@kroma/module-sdk';
import {
  Badge,
  Box,
  Button,
  Field,
  Icon,
  PageHeader,
  Row,
  Section,
  Surface,
  Text,
} from '@kroma/ui/kit';
import { useEffect, useState } from 'react';
import { useRokuApi } from './api';
import type { RokuDevice, RokuView } from './schemas';

export default function RokuPage() {
  const t = useT();
  const roku = useRokuApi();
  const canManage = useCap('settings.manage');
  const [view, setView] = useState<RokuView | null>(null);
  const [failed, setFailed] = useState(false);
  const [password, setPassword] = useState('');
  const [saved, setSaved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [address, setAddress] = useState('');
  const [addFailed, setAddFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    roku
      .status()
      .then((v) => {
        setView(v);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [roku]);

  if (!canManage) return <Denied />;
  if (!view) return failed ? <ModuleFailed /> : <ModuleLoading panels={2} />;

  const savePassword = async () => {
    setSaved(false);
    setView(await roku.savePassword(password));
    setPassword('');
    setSaved(true);
  };
  const scan = async () => {
    setScanning(true);
    try {
      setView(await roku.scan());
    } finally {
      setScanning(false);
    }
  };
  const add = async () => {
    setAddFailed(false);
    setScanning(true);
    try {
      setView(await roku.add(address));
      setAddress('');
    } catch {
      setAddFailed(true);
    } finally {
      setScanning(false);
    }
  };
  const run = async (serial: string, action: (serial: string) => Promise<RokuView>) => {
    setBusy(serial);
    try {
      setView(await action(serial));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('roku.title')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('roku.subtitle')}</PageHeader.Subtitle>
        <PageHeader.Actions>
          <Button
            label={scanning ? t('roku.scanning') : t('roku.scan')}
            icon="refresh"
            variant="primary"
            size="sm"
            onPress={() => void scan()}
            disabled={scanning}
          />
        </PageHeader.Actions>
      </PageHeader.Root>

      <Surface elevated border="border" pad="none" px={22} py={20} mt={24}>
        <Text variant="meta" color="textDim" mb={16}>
          {view.serverUrl ? t('roku.serverUrl', { url: view.serverUrl }) : t('roku.noLanAddress')}
        </Text>
        <Field.Root label={t('roku.password')} value={password} onValueChange={setPassword} mb={12}>
          <Field.Input
            type="password"
            placeholder={view.hasPassword ? t('roku.passwordKeep') : 'rokudev'}
          />
          <Field.Hint>{t('roku.passwordHint')}</Field.Hint>
        </Field.Root>
        <Row wrap gap={12}>
          <Button
            label={t('roku.save')}
            icon="device-floppy"
            variant="glass"
            size="sm"
            onPress={() => void savePassword()}
            disabled={password.trim() === ''}
          />
          {saved ? (
            <Text variant="meta" color="success">
              {t('roku.saved')}
            </Text>
          ) : null}
        </Row>
      </Surface>

      <Section.Root mt={28}>
        <Section.Header>
          <Section.Title>{t('roku.devices')}</Section.Title>
        </Section.Header>
        <Text variant="meta" color="textDim" mt={-8} mb={16}>
          {t('roku.devModeHint')}
        </Text>
        <Surface elevated border="border" pad="none" px={22} py={20} mb={12}>
          <Field.Root label={t('roku.address')} value={address} onValueChange={setAddress} mb={12}>
            <Field.Input placeholder="192.168.1.50" />
            <Field.Hint>{t('roku.addressHint')}</Field.Hint>
          </Field.Root>
          <Row wrap gap={12}>
            <Button
              label={t('roku.add')}
              icon="plus"
              variant="glass"
              size="sm"
              onPress={() => void add()}
              disabled={scanning || address.trim() === ''}
            />
            {addFailed ? (
              <Text variant="meta" color="danger">
                {t('roku.addFailed')}
              </Text>
            ) : null}
          </Row>
        </Surface>
        {view.devices.length === 0 ? (
          <Surface elevated border="border" pad="none" px={22} py={20}>
            <Text variant="meta" color="textDim">
              {t('roku.noDevices')}
            </Text>
          </Surface>
        ) : (
          view.devices.map((device) => (
            <DeviceCard
              key={device.serial}
              device={device}
              hasPassword={view.hasPassword}
              busy={busy === device.serial}
              onInstall={() => void run(device.serial, roku.install)}
              onLaunch={() => void run(device.serial, roku.launch)}
            />
          ))
        )}
        <Text variant="meta" color="textDim" mt={16}>
          {t('roku.pairHint')}
        </Text>
      </Section.Root>
    </>
  );
}

interface DeviceCardProps {
  device: RokuDevice;
  hasPassword: boolean;
  busy: boolean;
  onInstall: () => void;
  onLaunch: () => void;
}

function DeviceCard({ device, hasPassword, busy, onInstall, onLaunch }: Readonly<DeviceCardProps>) {
  const t = useT();
  const installed = device.install.status === 'installed';
  return (
    <Surface elevated border="border" pad="none" px={22} py={20} mb={12}>
      <Row between gap={16}>
        <Row shrink={1} minW={0} gap={14}>
          <Row center w={40} h={40} shrink={0} radius="md" bg="info/16">
            <Icon name="device-tv" size={20} thickness={1.8} color="info" />
          </Row>
          <Box shrink={1} minW={0}>
            <Text variant="cardTitle">{device.name || device.model}</Text>
            <Text variant="meta" color="textDim" mt={2}>
              {device.model} · {device.ip} · {device.softwareVersion}
            </Text>
          </Box>
        </Row>
        <InstallChip device={device} />
      </Row>
      {device.install.status === 'failed' ? (
        <Text variant="meta" color="danger" mt={8}>
          {device.install.message === 'password'
            ? t('roku.failedPassword')
            : device.install.message}
        </Text>
      ) : null}
      {!hasPassword ? (
        <Text variant="meta" color="textDim" mt={8}>
          {t('roku.needPassword')}
        </Text>
      ) : null}
      <Row wrap gap={12} mt={16}>
        <Button
          label={busy ? t('roku.installing') : t('roku.install')}
          icon="download"
          variant="primary"
          size="sm"
          onPress={onInstall}
          disabled={busy || !hasPassword || !device.developerEnabled}
        />
        {installed ? (
          <Button
            label={t('roku.launch')}
            icon="player-play"
            variant="glass"
            size="sm"
            onPress={onLaunch}
            disabled={busy}
          />
        ) : null}
      </Row>
    </Surface>
  );
}

function InstallChip({ device }: Readonly<{ device: RokuDevice }>) {
  const t = useT();
  if (!device.developerEnabled) return <Badge tone="warning">{t('roku.devModeOff')}</Badge>;
  switch (device.install.status) {
    case 'installed':
      return <Badge tone="success">{t('roku.installed')}</Badge>;
    case 'installing':
      return <Badge tone="warning">{t('roku.installing')}</Badge>;
    case 'failed':
      return <Badge tone="danger">{t('roku.failed')}</Badge>;
    default:
      return <Badge tone="neutral">{t('roku.devMode')}</Badge>;
  }
}
