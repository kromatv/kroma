// Admin AI page: register the LLM providers that power personalized home
// sections and taste profiles. Backed by /api/admin/llm*.
import type { LlmAdminConfig } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Badge,
  Box,
  Button,
  EmptyState,
  Icon,
  Row,
  Section,
  Surface,
  Switch,
  Text,
} from '@kroma/ui/kit';
import { useEffect, useState } from 'react';
import { ProviderCard, type ProviderForm } from '#web/features/admin/ai-providers';
import { Denied, PageHeader, useCap } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

// `id` is the server's (blank until saved); `key` is a client-only handle. The
// client never mints provider ids.
type ProviderRow = ProviderForm & { key: string };
type Config = { enabled: boolean; defaultKey: string; providers: ProviderRow[] };

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `row-${keySeq}`;
}

function emptyProvider(): ProviderRow {
  return {
    key: nextKey(),
    id: '',
    name: '',
    provider: 'openai',
    baseUrl: '',
    model: '',
    apiKey: '',
    hasApiKey: false,
    temperature: 0.7,
    maxTokens: 900,
    reasoning: false,
  };
}

function toConfig(c: LlmAdminConfig): Config {
  const providers: ProviderRow[] = c.providers.map((p) => ({ ...p, key: nextKey(), apiKey: '' }));
  const def = providers.find((p) => p.id === c.defaultId) ?? providers[0];
  return { enabled: c.enabled, defaultKey: def?.key ?? '', providers };
}

export function AiPage() {
  const t = useT();
  const { client } = useAuth();
  const canManage = useCap('settings.manage');

  const [config, setConfig] = useState<Config | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<'idle' | 'save'>('idle');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      .adminLlm()
      .then((c) => setConfig(toConfig(c)))
      .catch(() => undefined);
  }, [client]);

  if (!canManage) return <Denied />;
  if (!config) return null;
  const cfg = config;

  const update = (patch: Partial<Config>) => {
    setConfig((c) => (c ? { ...c, ...patch } : c));
    setSaved(false);
  };
  const patchProvider = (key: string, patch: Partial<ProviderRow>) =>
    update({ providers: cfg.providers.map((p) => (p.key === key ? { ...p, ...patch } : p)) });

  const addProvider = () => {
    const np = emptyProvider();
    update({
      providers: [...cfg.providers, np],
      defaultKey: cfg.providers.length === 0 ? np.key : cfg.defaultKey,
    });
    setExpandedKey(np.key);
  };
  const removeProvider = (key: string) => {
    const rest = cfg.providers.filter((p) => p.key !== key);
    update({
      providers: rest,
      defaultKey: cfg.defaultKey === key ? (rest[0]?.key ?? '') : cfg.defaultKey,
    });
  };

  const save = async () => {
    setBusy('save');
    setError(null);
    try {
      // Identified by index: new rows have no id until the server assigns one.
      const defaultIndex = Math.max(
        0,
        cfg.providers.findIndex((p) => p.key === cfg.defaultKey),
      );
      await client.saveLlm({
        enabled: cfg.enabled,
        defaultIndex,
        providers: cfg.providers.map((p) => ({
          id: p.id,
          name: p.name,
          provider: p.provider,
          baseUrl: p.baseUrl,
          model: p.model,
          temperature: p.temperature,
          maxTokens: p.maxTokens,
          reasoning: p.reasoning,
          ...(p.apiKey ? { apiKey: p.apiKey } : {}),
        })),
      });
      // Re-fetch to adopt the server-assigned ids, which the per-provider key
      // probe needs.
      setConfig(toConfig(await client.adminLlm()));
      setSaved(true);
    } catch {
      setError(t('jobs.saveFailed'));
    } finally {
      setBusy('idle');
    }
  };

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.aiTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.aiSub')}</PageHeader.Subtitle>
        <PageHeader.Actions>
          <StatusChip enabled={cfg.enabled} />
        </PageHeader.Actions>
      </PageHeader.Root>

      <Surface
        elevated
        pad="none"
        radius="xl"
        border="border"
        row
        align="center"
        justify="space-between"
        gap={16}
        px={22}
        py={18}
        mt={24}
      >
        <Row gap={14}>
          <Row center w={40} h={40} shrink={0} radius="xs" bg="accentSoft">
            <Icon name="sparkles" size={20} stroke={1.8} color="accentText" />
          </Row>
          <Box>
            <Text variant="label">{t('admin.aiEnabled')}</Text>
            <Text variant="meta" color="textDim" mt={2}>
              {t('admin.aiEnabledHint')}
            </Text>
          </Box>
        </Row>
        <Switch
          checked={cfg.enabled}
          onCheckedChange={(v) => update({ enabled: v })}
          label={t('admin.aiEnabled')}
        />
      </Surface>

      <Section.Root mt={28}>
        <Section.Header>
          <Section.Title>{t('admin.aiProviders')}</Section.Title>
          <Section.Actions>
            <Button
              variant="glass"
              size="sm"
              icon="plus"
              label={t('admin.aiAddProvider')}
              onPress={addProvider}
            />
          </Section.Actions>
        </Section.Header>
        <Text variant="meta" color="textDim" mt={-8} mb={16}>
          {t('admin.aiProvidersHint')}
        </Text>
        {cfg.providers.length === 0 ? (
          <EmptyState.Root icon="sparkles">
            <EmptyState.Title>{t('admin.aiNoProviders')}</EmptyState.Title>
            <EmptyState.Actions>
              <Button
                variant="glass"
                size="sm"
                icon="plus"
                label={t('admin.aiAddProvider')}
                onPress={addProvider}
              />
            </EmptyState.Actions>
          </EmptyState.Root>
        ) : (
          <Box gap={12}>
            {cfg.providers.map((p) => (
              <ProviderCard
                key={p.key}
                provider={p}
                isDefault={cfg.defaultKey === p.key}
                expanded={expandedKey === p.key}
                onToggle={() => setExpandedKey((x) => (x === p.key ? null : p.key))}
                onChange={(patch) => patchProvider(p.key, patch)}
                onSetDefault={() => update({ defaultKey: p.key })}
                onRemove={() => removeProvider(p.key)}
                client={client}
              />
            ))}
          </Box>
        )}
      </Section.Root>

      <Row wrap gap={12} mt={24}>
        <Button
          label={busy === 'save' ? t('admin.aiSaving') : t('common.save')}
          icon="device-floppy"
          variant="primary"
          onPress={() => void save()}
          disabled={busy !== 'idle'}
        />
        {saved ? (
          <Text variant="meta" color="success">
            {t('admin.aiSaved')}
          </Text>
        ) : null}
        {error ? (
          <Text variant="meta" color="danger">
            {error}
          </Text>
        ) : null}
      </Row>
    </>
  );
}

function StatusChip({ enabled }: Readonly<{ enabled: boolean }>) {
  const t = useT();
  return enabled ? (
    <Badge tone="warning">{t('admin.aiStatusOn')}</Badge>
  ) : (
    <Badge tone="neutral">{t('admin.aiStatusOff')}</Badge>
  );
}
