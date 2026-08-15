// One LLM provider, rendered as an inline expandable card: collapsed header
// shows name + type + default badge + model·host; expanded reveals the
// editable fields and per-card Test / Set default / Remove. Backed by
// /api/admin/llm*.
import type { KromaClient, MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Badge,
  Box,
  Button,
  Disclosure,
  Divider,
  Field,
  Icon,
  NumberField,
  Row,
  SegmentGroup,
  Spacer,
  Surface,
  Switch,
  Text,
} from '@kroma/ui/kit';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { SearchSelect } from './search-select';

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

const DANGER_LABEL = { fontSize: 13, fontWeight: '600' } as const;
const MONO = { fontFamily: 'monospace' } as const;
const MODEL_PICKER = { width: 288, maxWidth: '100%' } as const;

// `apiKey` is a transient field ('' = keep the stored secret); `hasApiKey`
// reports whether one is stored server-side.
export type ProviderForm = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  hasApiKey: boolean;
  temperature: number;
  maxTokens: number;
  reasoning: boolean;
};

const PROVIDER_BASE: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  anthropic: '',
  openai: '',
};
const BASE_HINT_KEY: Record<string, MessageKey> = {
  anthropic: 'admin.aiBaseUrlAnthropic',
  openrouter: 'admin.aiBaseUrlOpenrouter',
};
const MODEL_PLACEHOLDER: Record<string, string> = {
  anthropic: 'claude-haiku-4-5',
  openrouter: 'qwen/qwen-2.5-7b-instruct',
};

// Temperature is OpenAI-only, reasoning is Anthropic-only; unknown providers
// fall back to the openai layout.
type Spec = {
  baseUrl: 'required' | 'advanced';
  apiKey: 'required' | 'optional';
  temperature: boolean;
  reasoning: boolean;
};
const SPEC_OPENAI: Spec = {
  baseUrl: 'required',
  apiKey: 'optional',
  temperature: true,
  reasoning: false,
};
const SPEC: Record<string, Spec> = {
  openai: SPEC_OPENAI,
  openrouter: { baseUrl: 'advanced', apiKey: 'required', temperature: true, reasoning: false },
  anthropic: { baseUrl: 'advanced', apiKey: 'required', temperature: false, reasoning: true },
};

function hostOf(baseUrl: string, isAnthropic: boolean): string {
  if (!baseUrl) return isAnthropic ? 'api.anthropic.com' : '';
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

type Probe = { ok: boolean; text: string } | null;
type Busy = 'idle' | 'test' | 'models';

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

function ModelField({
  p,
  models,
  busy,
  modelPlaceholder,
  onModel,
  onLoad,
}: Readonly<{
  p: ProviderForm;
  models: string[];
  busy: Busy;
  modelPlaceholder: string;
  onModel: (v: string) => void;
  onLoad: () => void;
}>) {
  const t = useT();
  return (
    <Field.Root label={t('admin.aiModel')} mb={16}>
      <Row wrap gap={8}>
        {models.length > 0 ? (
          <SearchSelect
            value={p.model}
            options={models}
            onChange={onModel}
            placeholder={modelPlaceholder}
            searchPlaceholder={t('admin.aiSearchModels')}
            style={MODEL_PICKER}
          />
        ) : (
          <Field.Root label={t('admin.aiModel')} hideLabel w={288} maxW="100%">
            <Field.Input
              icon="brain"
              value={p.model}
              onValueChange={onModel}
              placeholder={modelPlaceholder}
              textStyle={MONO}
            />
          </Field.Root>
        )}
        <Button
          variant="glass"
          size="sm"
          label={busy === 'models' ? t('admin.aiLoading') : t('admin.aiLoadModels')}
          icon="reload"
          onPress={onLoad}
          disabled={busy !== 'idle'}
        />
      </Row>
      <Field.Hint>
        {models.length > 0
          ? t('admin.aiModelsCount', { count: models.length })
          : t('admin.aiModelHint')}
      </Field.Hint>
    </Field.Root>
  );
}

function AdvancedSection({
  p,
  spec,
  baseUrlField,
  onSet,
}: Readonly<{
  p: ProviderForm;
  spec: Spec;
  baseUrlField: ReactNode;
  onSet: (patch: Partial<ProviderForm>) => void;
}>) {
  const t = useT();
  return (
    <Disclosure.Root>
      <Disclosure.Trigger>{t('admin.aiAdvanced')}</Disclosure.Trigger>
      {spec.baseUrl === 'advanced' ? baseUrlField : null}
      {spec.temperature ? (
        <Field.Root label={t('admin.aiTemperature')} mb={16}>
          <NumberField
            label={t('admin.aiTemperature')}
            value={p.temperature}
            step={0.1}
            min={0}
            max={2}
            onValueChange={(n) => onSet({ temperature: n })}
          />
          <Field.Hint>{t('admin.aiTemperatureHint')}</Field.Hint>
        </Field.Root>
      ) : null}
      <Field.Root label={t('admin.aiMaxTokens')} mb={16}>
        <NumberField
          label={t('admin.aiMaxTokens')}
          value={p.maxTokens}
          step={100}
          min={64}
          onValueChange={(n) => onSet({ maxTokens: n })}
        />
        <Field.Hint>{t('admin.aiMaxTokensHint')}</Field.Hint>
      </Field.Root>
      {spec.reasoning ? (
        <Row between gap={16} mb={16}>
          <Box>
            <Text variant="label">{t('admin.aiReasoning')}</Text>
            <Text variant="meta" color="textDim" mt={2}>
              {t('admin.aiReasoningHint')}
            </Text>
          </Box>
          <Switch
            checked={p.reasoning}
            onCheckedChange={(v) => onSet({ reasoning: v })}
            label={t('admin.aiReasoning')}
          />
        </Row>
      ) : null}
    </Disclosure.Root>
  );
}

function CardActions({
  busy,
  isDefault,
  probe,
  onTest,
  onSetDefault,
  onRemove,
}: Readonly<{
  busy: Busy;
  isDefault: boolean;
  probe: Probe;
  onTest: () => void;
  onSetDefault: () => void;
  onRemove: () => void;
}>) {
  const t = useT();
  return (
    <Row wrap gap={10} mt={8} mb={20}>
      <Button
        variant="glass"
        size="sm"
        label={busy === 'test' ? t('admin.aiTesting') : t('admin.aiTest')}
        icon="plug-connected"
        onPress={onTest}
        disabled={busy !== 'idle'}
      />
      {!isDefault ? (
        <Button
          variant="glass"
          size="sm"
          label={t('admin.aiSetDefault')}
          icon="star"
          onPress={onSetDefault}
        />
      ) : null}
      {probe ? (
        <Row gap={6}>
          <Icon
            name={probe.ok ? 'check' : 'x'}
            size={15}
            thickness={2.4}
            color={probe.ok ? 'success' : 'danger'}
          />
          <Text variant="meta" color={probe.ok ? 'success' : 'danger'}>
            {probe.text}
          </Text>
        </Row>
      ) : null}
      <Spacer />
      <Button variant="ghost" size="sm" onPress={onRemove}>
        <Icon name="trash" size={15} color="danger" />
        <Text color="danger" style={DANGER_LABEL}>
          {t('admin.aiRemoveProvider')}
        </Text>
      </Button>
    </Row>
  );
}

function ProviderBody({
  p,
  spec,
  models,
  busy,
  modelPlaceholder,
  probe,
  isDefault,
  set,
  onProvider,
  onLoadModels,
  onTest,
  onSetDefault,
  onRemove,
}: Readonly<{
  p: ProviderForm;
  spec: Spec;
  models: string[];
  busy: Busy;
  modelPlaceholder: string;
  probe: Probe;
  isDefault: boolean;
  set: (patch: Partial<ProviderForm>) => void;
  onProvider: (v: string) => void;
  onLoadModels: () => void;
  onTest: () => void;
  onSetDefault: () => void;
  onRemove: () => void;
}>) {
  const t = useT();
  // Placed in the main column (openai) or under Advanced (openrouter/anthropic).
  const baseUrlField = (
    <Field.Root label={t('admin.aiBaseUrl')} maxW={480} mb={16}>
      <Field.Input
        icon="world"
        value={p.baseUrl}
        onValueChange={(v) => set({ baseUrl: v })}
        placeholder={PROVIDER_BASE[p.provider] || 'http://localhost:11434/v1'}
        textStyle={MONO}
      />
      <Field.Hint>{t(BASE_HINT_KEY[p.provider] ?? 'admin.aiBaseUrlHint')}</Field.Hint>
    </Field.Root>
  );
  const apiKeyRequirement =
    spec.apiKey === 'required' ? t('admin.aiRequired') : t('admin.aiOptional');

  return (
    <>
      <Divider />
      <Box px={20} pt={20}>
        <Field.Root label={t('admin.aiProviderName')} maxW={480} mb={16}>
          <Field.Input
            icon="tag"
            value={p.name}
            onValueChange={(v) => set({ name: v })}
            placeholder={t('admin.aiProviderNamePlaceholder')}
          />
        </Field.Root>

        <Field.Root label={t('admin.aiProvider')} mb={16}>
          <SegmentGroup.Root value={p.provider} onValueChange={onProvider}>
            <SegmentGroup.Item value="openai">
              <SegmentGroup.Label>{t('admin.aiProviderOpenai')}</SegmentGroup.Label>
            </SegmentGroup.Item>
            <SegmentGroup.Item value="openrouter">
              <SegmentGroup.Label>{t('admin.aiProviderOpenrouter')}</SegmentGroup.Label>
            </SegmentGroup.Item>
            <SegmentGroup.Item value="anthropic">
              <SegmentGroup.Label>{t('admin.aiProviderAnthropic')}</SegmentGroup.Label>
            </SegmentGroup.Item>
          </SegmentGroup.Root>
          <Field.Hint>{t('admin.aiProviderHint')}</Field.Hint>
        </Field.Root>

        {spec.baseUrl === 'required' ? baseUrlField : null}

        <Field.Root label={`${t('admin.aiApiKey')} · ${apiKeyRequirement}`} maxW={480} mb={16}>
          <Field.Input
            type="password"
            icon="key"
            value={p.apiKey}
            onValueChange={(v) => set({ apiKey: v })}
            placeholder={p.hasApiKey ? t('admin.aiApiKeyKeep') : 'sk-…'}
            textStyle={MONO}
          />
          <Field.Hint>{t('admin.aiApiKeyHint')}</Field.Hint>
        </Field.Root>

        <ModelField
          p={p}
          models={models}
          busy={busy}
          modelPlaceholder={modelPlaceholder}
          onModel={(v) => set({ model: v })}
          onLoad={onLoadModels}
        />

        <AdvancedSection p={p} spec={spec} baseUrlField={baseUrlField} onSet={set} />

        <CardActions
          busy={busy}
          isDefault={isDefault}
          probe={probe}
          onTest={onTest}
          onSetDefault={onSetDefault}
          onRemove={onRemove}
        />
      </Box>
    </>
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
