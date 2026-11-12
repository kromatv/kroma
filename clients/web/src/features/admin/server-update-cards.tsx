import type { UpdateStatus, UpdateOperation } from '@kromatv/client/admin';
import { useT } from '@kromatv/ui';
import {
  Badge,
  Box,
  Button,
  Icon,
  Row,
  Progress,
  Section,
  Surface,
  Switch,
  Text,
  useBreakpoint,
} from '@kromatv/ui/kit';
import { Linking } from 'react-native';
import { RouteLink } from '#web/shared/ui/route-link';

const DOCS = 'https://github.com/kromatv/kroma/blob/main/server/updater/README.md';

export function UpdateHero({
  data,
  busy,
  onInstall,
}: Readonly<{ data: UpdateStatus; busy: boolean; onInstall: () => void }>) {
  const t = useT();
  const narrow = useBreakpoint() === 'base';
  const title = heroTitle(data);
  const icon = heroIcon(data);
  return (
    <Surface
      elevated
      pad="none"
      border={data.available ? 'accent/35' : 'border'}
      radius="xl"
      overflow="hidden"
      mt={24}
    >
      <Box p={narrow ? 22 : 32} gap={24}>
        <Row between gap={16}>
          <Text variant="overline" color="textDim">
            {t('admin.updatesServerSoftware')}
          </Text>
          <Badge tone={data.channel === 'Stable' ? 'success' : 'warning'}>{data.channel}</Badge>
        </Row>
        <Row gap={14}>
          <Row
            center
            w={narrow ? 40 : 52}
            h={narrow ? 40 : 52}
            shrink={0}
            radius="lg"
            bg={data.available ? 'accentSoft' : 'success/12'}
          >
            <Icon
              name={icon}
              size={narrow ? 22 : 26}
              color={data.available || data.error ? 'accentText' : 'success'}
            />
          </Row>
          <Text variant={narrow ? 'h2' : 'heading'} flex>
            {t(title)}
          </Text>
        </Row>
        <VersionComparison data={data} />
        <Text variant="meta" color="textMuted" maxW={650}>
          {t(data.available ? 'admin.updatesReadyHint' : 'admin.updatesCurrentHint')}
        </Text>
        <UpdateActions data={data} busy={busy} onInstall={onInstall} />
        <Box pt={16}>
          <Text variant="meta" color="textDim">
            {data.checkedAt
              ? t('admin.updatesLastChecked', { date: new Date(data.checkedAt).toLocaleString() })
              : t('admin.updatesNotCheckedHint')}
          </Text>
          {data.error ? (
            <Text variant="meta" color="danger" mt={6}>
              {t('admin.updatesFeedError')}
            </Text>
          ) : null}
        </Box>
      </Box>
    </Surface>
  );
}

function VersionStamp({
  label,
  version,
  build,
  accent,
  compact,
}: Readonly<{
  label: string;
  version: string;
  build?: number | null;
  accent?: boolean;
  compact?: boolean;
}>) {
  const t = useT();
  return (
    <Box
      gap={8}
      row={compact}
      justify={compact ? 'space-between' : undefined}
      align={compact ? 'center' : undefined}
    >
      <Box gap={4}>
        <Text variant="meta" color="textDim">
          {label}
        </Text>
        <Text variant="meta" color="textDim" font="mono">
          {build ? t('admin.updatesBuild', { build: String(build) }) : t('admin.updatesLocalBuild')}
        </Text>
      </Box>
      <Text variant={compact ? 'h2' : 'h1'} color={accent ? 'accentText' : 'text'}>
        v{version}
      </Text>
    </Box>
  );
}

export function ChannelSettings({
  data,
  disabled,
  onChannel,
  onAuto,
  onAutoInstall,
  autoInstallDisabled,
}: Readonly<{
  data: UpdateStatus;
  disabled: boolean;
  onChannel: (channel: 'Stable' | 'Canary') => void;
  onAuto: (auto: boolean) => void;
  onAutoInstall: (auto: boolean) => void;
  autoInstallDisabled: boolean;
}>) {
  const t = useT();
  const narrow = useBreakpoint() === 'base';
  return (
    <Section.Root mt={32}>
      <Section.Header>
        <Section.Title>{t('admin.updateChannel')}</Section.Title>
      </Section.Header>
      <Box row={!narrow} gap={12}>
        {(['Stable', 'Canary'] as const).map((channel) => (
          <Surface
            key={channel}
            elevated
            border={data.channel === channel ? 'accent/45' : 'border'}
            radius="lg"
            pad="lg"
            flex
            gap={12}
          >
            <Row between gap={16}>
              <Row gap={10}>
                <Icon
                  name={channel === 'Stable' ? 'shield-check' : 'flask'}
                  size={20}
                  color={data.channel === channel ? 'accentText' : 'textDim'}
                />
                <Text variant="cardTitle">{channel}</Text>
              </Row>
              {data.channel === channel ? (
                <Badge tone="4K">{t('admin.updatesSelected')}</Badge>
              ) : null}
            </Row>
            <Text variant="meta" color="textDim">
              {t(channel === 'Stable' ? 'admin.updatesStableHint' : 'admin.updatesCanaryHint')}
            </Text>
            <Button
              size="sm"
              variant={data.channel === channel ? 'glass' : 'outline'}
              label={t(
                data.channel === channel ? 'admin.updatesFollowing' : 'admin.updatesChoose',
                { channel },
              )}
              disabled={disabled || data.channel === channel}
              onPress={() => onChannel(channel)}
            />
          </Surface>
        ))}
      </Box>
      <Surface elevated border="border" radius="lg" pad="lg" mt={12}>
        <Row between gap={16}>
          <Box flex gap={4}>
            <Text variant="label">{t('admin.autoUpdate')}</Text>
            <Text variant="meta" color="textDim">
              {t('admin.updatesAutoHint')}
            </Text>
          </Box>
          <Switch
            label={t('admin.autoUpdate')}
            checked={data.auto}
            disabled={disabled}
            onCheckedChange={onAuto}
          />
        </Row>
      </Surface>
      <Surface
        elevated
        border={data.autoInstall ? 'accent/35' : 'border'}
        radius="lg"
        pad="lg"
        mt={12}
      >
        <Row between gap={16}>
          <Box flex gap={4}>
            <Text variant="label">{t('admin.updatesAutoInstall')}</Text>
            <Text variant="meta" color="textDim">
              {t('admin.updatesAutoInstallHint')}
            </Text>
            {!data.installer?.ready ? (
              <Text variant="meta" color="accentText">
                {t('admin.updatesAutoInstallSetup')}
              </Text>
            ) : null}
          </Box>
          <Switch
            label={t('admin.updatesAutoInstall')}
            checked={data.autoInstall}
            disabled={autoInstallDisabled}
            onCheckedChange={onAutoInstall}
          />
        </Row>
      </Surface>
    </Section.Root>
  );
}

export function InstallMethod({ data }: Readonly<{ data: UpdateStatus }>) {
  const t = useT();
  const platform = data.installer?.platform ?? 'unknown';
  const platformNames = {
    docker: 'Docker Compose',
    synology: 'Synology DSM',
    binary: null,
    unknown: null,
  };
  const hints = {
    docker: 'admin.updatesDockerHint',
    synology: 'admin.updatesSynologyHint',
    binary: 'admin.updatesBinaryHint',
    unknown: 'admin.updatesBinaryHint',
  } as const;
  return (
    <Section.Root mt={32} mb={24}>
      <Section.Header>
        <Section.Title>{t('admin.updatesDelivery')}</Section.Title>
      </Section.Header>
      <Surface elevated border="border" radius="lg" pad="lg" gap={16}>
        <Row wrap between gap={12}>
          <Row gap={10}>
            <Icon name="server" size={20} color="textDim" />
            <Text variant="cardTitle">{platformNames[platform] ?? t('admin.updatesNative')}</Text>
          </Row>
          <Badge tone={data.installer?.ready ? 'success' : 'neutral'}>
            {t(data.installer?.ready ? 'admin.updatesHostReady' : 'admin.updatesHostSetup')}
          </Badge>
        </Row>
        {!data.installer?.ready ? (
          <Text variant="meta" color="textDim">
            {t(hints[platform])}
          </Text>
        ) : null}
        {!data.installer?.ready && platform !== 'synology' ? (
          <Text variant="meta" color="textMuted">
            {t('admin.updatesSetupHint')}
          </Text>
        ) : null}
        {!data.installer?.ready ? (
          <Row wrap gap={10}>
            <Button
              size="sm"
              variant="outline"
              icon="external-link"
              label={t('admin.updatesSetupGuide')}
              onPress={() => void Linking.openURL(DOCS)}
            />
          </Row>
        ) : null}
      </Surface>
    </Section.Root>
  );
}

function heroTitle(data: UpdateStatus) {
  if (data.error) return 'admin.updatesCheckFailed';
  if (data.available) return 'admin.updatesReady';
  if (data.checkedAt && data.latest) return 'admin.updatesCurrent';
  return 'admin.updatesNotChecked';
}

function heroIcon(data: UpdateStatus) {
  if (data.error) return 'cloud-off';
  if (data.available) return 'download';
  return 'shield-check';
}

const STEPS = ['backing_up', 'preparing', 'installing', 'restarting', 'complete'] as const;
const PHASE_KEYS = {
  backing_up: 'admin.updatesBackingUp',
  queued: 'admin.updatesQueued',
  preparing: 'admin.updatesPreparing',
  waiting_idle: 'admin.updatesWaitingIdle',
  deferred: 'admin.updatesWaitingIdle',
  installing: 'admin.updatesInstalling',
  restarting: 'admin.updatesRestarting',
  complete: 'admin.updatesComplete',
  failed: 'admin.updateFailed',
} as const;
function stageOf(phase: UpdateOperation['phase']) {
  if (phase === 'queued' || phase === 'waiting_idle' || phase === 'deferred') return 1;
  return Math.max(0, STEPS.indexOf(phase as (typeof STEPS)[number]));
}

export function UpdateProgress({ operation }: Readonly<{ operation: UpdateOperation }>) {
  const t = useT();
  const complete = operation.phase === 'complete';
  const stage = stageOf(operation.phase);
  return (
    <Surface
      elevated
      border={complete ? 'success/35' : 'accent/35'}
      radius="xl"
      pad="lg"
      mt={24}
      gap={24}
      accessibilityLiveRegion="polite"
    >
      <Row wrap between gap={12}>
        <Text variant="overline" color={complete ? 'success' : 'accentText'}>
          {t(complete ? 'admin.updatesComplete' : 'admin.updatesInProgress')}
        </Text>
        <Text variant="meta" color="textDim" font="mono">
          v{operation.target.version} · {operation.target.channel}
        </Text>
      </Row>
      <Box gap={12}>
        <Text variant="heading">{t(PHASE_KEYS[operation.phase])}</Text>
        <Text variant="meta" color="textDim">
          {t('admin.updatesStep', { step: String(stage + 1), total: String(STEPS.length) })}
        </Text>
      </Box>
      <Progress
        value={complete ? 1 : stage / (STEPS.length - 1)}
        waiting={!complete}
        thickness={6}
        label={t('admin.updatesStages')}
        color={complete ? 'success' : 'accent'}
      />
      <Box gap={16}>
        {STEPS.map((step, index) => (
          <Row key={step} gap={12}>
            <Row w={28} h={28} center radius="pill" bg={index <= stage ? 'accentSoft' : 'tint/5'}>
              {index < stage || complete ? (
                <Icon name="check" size={16} color="success" />
              ) : (
                <Text variant="meta" color={index === stage ? 'accentText' : 'textDim'}>
                  {index + 1}
                </Text>
              )}
            </Row>
            <Text variant="label" color={index > stage ? 'textDim' : 'text'}>
              {t(PHASE_KEYS[step])}
            </Text>
            {index === stage && !complete ? <Badge tone="4K">{t('admin.updatesNow')}</Badge> : null}
          </Row>
        ))}
      </Box>
      <Text variant="meta" color="textDim">
        {t(complete ? 'admin.updatesCompleteHint' : 'admin.updatesProgressHint')}
      </Text>
    </Surface>
  );
}

function UpdateActions({
  data,
  busy,
  onInstall,
}: Readonly<{ data: UpdateStatus; busy: boolean; onInstall: () => void }>) {
  const t = useT();
  const ready = !!data.installer?.ready && !!data.latest?.build && !data.error;
  return (
    <Row wrap gap={10}>
      {data.available ? (
        <Button
          variant="primary"
          icon="download"
          label={t('admin.updatesInstall')}
          disabled={busy || !ready}
          onPress={onInstall}
        />
      ) : null}
      {data.latest ? (
        <Button
          variant="glass"
          icon="external-link"
          label={t('admin.updateNotes')}
          onPress={() => void Linking.openURL(data.latest!.url)}
        />
      ) : null}
      <Button variant="outline" icon="archive" label={t('admin.updateBackup')} asChild>
        <RouteLink to="/admin/backup" />
      </Button>
    </Row>
  );
}

function VersionComparison({ data }: Readonly<{ data: UpdateStatus }>) {
  const t = useT();
  const narrow = useBreakpoint() === 'base';
  return (
    <Box row={!narrow} gap={narrow ? 16 : 36}>
      <VersionStamp
        label={t('admin.updatesInstalled')}
        version={data.version}
        build={data.build}
        compact={narrow}
      />
      {data.latest ? (
        <>
          {narrow ? null : (
            <Box self="center">
              <Icon name="arrow-right" size={24} color="textDim" />
            </Box>
          )}
          <VersionStamp
            label={t(data.available ? 'admin.updatesAvailable' : 'admin.updatesLatest')}
            version={data.latest.version}
            build={data.latest.build}
            accent={data.available}
            compact={narrow}
          />
        </>
      ) : null}
    </Box>
  );
}
