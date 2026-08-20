// One LLM provider, rendered as an inline expandable card: collapsed header
// shows name + type + default badge + model·host; expanded reveals the
// editable fields and per-card Test / Set default / Remove. Backed by
// /api/admin/llm*.
import type { KromaClient } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Badge, Box, Icon, Row, Surface, Text } from '@kroma/ui/kit';
import { type CSSProperties, useState } from 'react';
import { ProviderBody } from '#web/features/admin/ai-provider-fields';
import {
  type Busy,
  hostOf,
  MODEL_PLACEHOLDER,
  PROVIDER_BASE,
  type Probe,
  type ProviderForm,
  SPEC,
  SPEC_OPENAI,
} from '#web/features/admin/ai-provider-spec';

export type { ProviderForm } from '#web/features/admin/ai-provider-spec';

// The card's own header press target: a bare control, so it states the shape a
// page reset would otherwise have given it.
const HEADER_BUTTON: CSSProperties = {
  display: 'block',
  width: '100%',
  margin: 0,
  padding: 0,
  border: 0,
  background: 'none',
  textAlign: 'left',
  cursor: 'pointer',
};

function ProviderHeader({
  p,
  isDefault,
  expanded,
  host,
  probe,
  onToggle,
}: Readonly<{
  p: ProviderForm;
  isDefault: boolean;
  expanded: boolean;
  host: string;
  probe: Probe;
  onToggle: () => void;
}>) {
  const t = useT();
  return (
    <button type="button" onClick={onToggle} style={HEADER_BUTTON}>
      <Row gap={12} px={20} py={16}>
        <Box w={10} h={10} shrink={0} radius="circle" bg={isDefault ? 'accent' : 'tint/18'} />
        <Box flex minW={0}>
          <Row gap={8}>
            <Text variant="label" lines={1}>
              {p.name || t('admin.aiUntitledProvider')}
            </Text>
            <Badge tone="neutral">{p.provider}</Badge>
            {isDefault ? <Badge tone="warning">{t('admin.aiDefault')}</Badge> : null}
          </Row>
          <Text variant="meta" color="textDim" lines={1} mt={2}>
            {p.model || '-'}
            {host ? ` · ${host}` : ''}
          </Text>
        </Box>
        {probe ? (
          <Box w={8} h={8} shrink={0} radius="circle" bg={probe.ok ? 'success' : 'danger'} />
        ) : null}
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="textDim" />
      </Row>
    </button>
  );
}

export function ProviderCard({
  provider: p,
  isDefault,
  expanded,
  onToggle,
  onChange,
  onSetDefault,
  onRemove,
  client,
}: Readonly<{
  provider: ProviderForm;
  isDefault: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<ProviderForm>) => void;
  onSetDefault: () => void;
  onRemove: () => void;
  client: KromaClient;
}>) {
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>('idle');
  const [probe, setProbe] = useState<Probe>(null);

  const isAnthropic = p.provider === 'anthropic';
  const spec = SPEC[p.provider] ?? SPEC_OPENAI;
  const modelPlaceholder = MODEL_PLACEHOLDER[p.provider] ?? 'qwen2.5:1.5b-instruct';

  // Probe with the in-progress values; send the provider id so a blank key falls
  // back to *this* provider's stored secret server-side (omit the key when blank).
  const probeBody = () => ({
    id: p.id,
    provider: p.provider,
    baseUrl: p.baseUrl,
    model: p.model,
    ...(p.apiKey ? { apiKey: p.apiKey } : {}),
  });

  const set = (patch: Partial<ProviderForm>) => {
    onChange(patch);
    setProbe(null);
  };
  // Switching provider points at a different endpoint: reset base URL + models.
  const setProvider = (v: string) => {
    set({ provider: v, baseUrl: PROVIDER_BASE[v] ?? '' });
    setModels([]);
  };

  const loadModels = async () => {
    setBusy('models');
    try {
      const r = await client.llmModels(probeBody());
      setModels(r.models);
      if (r.error) setProbe({ ok: false, text: r.error });
    } finally {
      setBusy('idle');
    }
  };
  const test = async () => {
    setBusy('test');
    try {
      const r = await client.testLlm(probeBody());
      setProbe({ ok: r.ok, text: r.message });
    } finally {
      setBusy('idle');
    }
  };

  const host = hostOf(p.baseUrl, isAnthropic);

  return (
    <Surface elevated pad="none" radius="xl" border="border" overflow="hidden">
      <ProviderHeader
        p={p}
        isDefault={isDefault}
        expanded={expanded}
        host={host}
        probe={probe}
        onToggle={onToggle}
      />

      {expanded ? (
        <ProviderBody
          p={p}
          spec={spec}
          models={models}
          busy={busy}
          modelPlaceholder={modelPlaceholder}
          probe={probe}
          isDefault={isDefault}
          set={set}
          onProvider={setProvider}
          onLoadModels={loadModels}
          onTest={() => {
            test();
          }}
          onSetDefault={onSetDefault}
          onRemove={onRemove}
        />
      ) : null}
    </Surface>
  );
}
