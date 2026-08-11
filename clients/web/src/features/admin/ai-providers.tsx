// One LLM provider, rendered as an inline expandable card: collapsed header
// shows name + type + default badge + model·host; expanded reveals the
// editable fields and per-card Test / Set default / Remove. Backed by
// /api/admin/llm*.
import type { KromaClient, MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Badge,
  Button,
  Disclosure,
  Field,
  Icon,
  NumberField,
  SegmentedControl,
  Surface,
  Switch,
  Txt,
} from '@kroma/ui/kit';
import { IconCheck, IconChevronDown, IconX } from '@tabler/icons-react';
import { type ReactNode, useState } from 'react';
import { SearchSelect } from './search-select';

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
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-5 py-4 text-left"
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${isDefault ? 'bg-accent' : 'bg-white/18'}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-bold">
            {p.name || t('admin.aiUntitledProvider')}
          </span>
          <Badge tone="neutral">{p.provider}</Badge>
          {isDefault ? <Badge tone="warning">{t('admin.aiDefault')}</Badge> : null}
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-dim">
          {p.model || '-'}
          {host ? ` · ${host}` : ''}
        </div>
      </div>
      {probe ? (
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${probe.ok ? 'bg-success' : 'bg-danger'}`}
        />
      ) : null}
      <IconChevronDown
        size={16}
        className={`shrink-0 text-dim transition-transform ${expanded ? 'rotate-180' : ''}`}
      />
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
    <Field
      label={t('admin.aiModel')}
      hint={
        models.length > 0
          ? t('admin.aiModelsCount', { count: models.length })
          : t('admin.aiModelHint')
      }
      mb={16}
    >
      <div className="flex flex-wrap items-center gap-2">
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
          <Field
            label={t('admin.aiModel')}
            hideLabel
            icon="brain"
            value={p.model}
            onChange={onModel}
            placeholder={modelPlaceholder}
            w={288}
            maxW="100%"
            entry={{ textStyle: MONO }}
          />
        )}
        <Button
          variant="glass"
          size="sm"
          label={busy === 'models' ? t('admin.aiLoading') : t('admin.aiLoadModels')}
          icon="reload"
          onPress={onLoad}
          disabled={busy !== 'idle'}
        />
      </div>
    </Field>
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
    <Disclosure title={t('admin.aiAdvanced')}>
      {spec.baseUrl === 'advanced' ? baseUrlField : null}
      {spec.temperature ? (
        <Field label={t('admin.aiTemperature')} hint={t('admin.aiTemperatureHint')} mb={16}>
          <NumberField
            label={t('admin.aiTemperature')}
            value={p.temperature}
            step={0.1}
            min={0}
            max={2}
            onChange={(n) => onSet({ temperature: n })}
          />
        </Field>
      ) : null}
      <Field label={t('admin.aiMaxTokens')} hint={t('admin.aiMaxTokensHint')} mb={16}>
        <NumberField
          label={t('admin.aiMaxTokens')}
          value={p.maxTokens}
          step={100}
          min={64}
          onChange={(n) => onSet({ maxTokens: n })}
        />
      </Field>
      {spec.reasoning ? (
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-[14px] font-bold">{t('admin.aiReasoning')}</div>
            <div className="mt-0.5 text-[12.5px] text-dim">{t('admin.aiReasoningHint')}</div>
          </div>
          <Switch
            checked={p.reasoning}
            onChange={(v) => onSet({ reasoning: v })}
            label={t('admin.aiReasoning')}
          />
        </div>
      ) : null}
    </Disclosure>
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
    <div className="mb-5 mt-2 flex flex-wrap items-center gap-2.5">
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
        <span
          className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${probe.ok ? 'text-success' : 'text-danger'}`}
        >
          {probe.ok ? <IconCheck size={15} stroke={2.4} /> : <IconX size={15} stroke={2.4} />}
          {probe.text}
        </span>
      ) : null}
      <div className="ml-auto">
        <Button variant="ghost" size="sm" onPress={onRemove}>
          <Icon name="trash" size={15} color="danger" />
          <Txt color="danger" style={DANGER_LABEL}>
            {t('admin.aiRemoveProvider')}
          </Txt>
        </Button>
      </div>
    </div>
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
    <Field
      label={t('admin.aiBaseUrl')}
      hint={t(BASE_HINT_KEY[p.provider] ?? 'admin.aiBaseUrlHint')}
      icon="world"
      value={p.baseUrl}
      onChange={(v) => set({ baseUrl: v })}
      placeholder={PROVIDER_BASE[p.provider] || 'http://localhost:11434/v1'}
      maxW={480}
      mb={16}
      entry={{ textStyle: MONO }}
    />
  );
  const apiKeyRequirement =
    spec.apiKey === 'required' ? t('admin.aiRequired') : t('admin.aiOptional');

  return (
    <div className="border-t border-border px-5 pt-5">
      <Field
        label={t('admin.aiProviderName')}
        icon="tag"
        value={p.name}
        onChange={(v) => set({ name: v })}
        placeholder={t('admin.aiProviderNamePlaceholder')}
        maxW={480}
        mb={16}
      />

      <Field label={t('admin.aiProvider')} hint={t('admin.aiProviderHint')} mb={16}>
        <SegmentedControl.Root
          value={p.provider}
          onValueChange={onProvider}
          options={[
            { value: 'openai', label: t('admin.aiProviderOpenai') },
            { value: 'openrouter', label: t('admin.aiProviderOpenrouter') },
            { value: 'anthropic', label: t('admin.aiProviderAnthropic') },
          ]}
        />
      </Field>

      {spec.baseUrl === 'required' ? baseUrlField : null}

      <Field
        label={`${t('admin.aiApiKey')} · ${apiKeyRequirement}`}
        hint={t('admin.aiApiKeyHint')}
        type="password"
        icon="key"
        value={p.apiKey}
        onChange={(v) => set({ apiKey: v })}
        placeholder={p.hasApiKey ? t('admin.aiApiKeyKeep') : 'sk-…'}
        maxW={480}
        mb={16}
        entry={{ textStyle: MONO }}
      />

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
    </div>
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
    <Surface elevated pad="none" radius={16} border="border" overflow="hidden">
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
