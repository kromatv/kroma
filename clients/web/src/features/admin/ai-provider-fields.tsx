import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  Disclosure,
  Divider,
  Field,
  NumberField,
  Row,
  SegmentGroup,
  Switch,
  Text,
} from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { CardActions } from '#web/features/admin/ai-provider-actions';
import {
  BASE_HINT_KEY,
  type Busy,
  PROVIDER_BASE,
  type Probe,
  type ProviderForm,
  type Spec,
} from '#web/features/admin/ai-provider-spec';
import { SearchSelect } from './search-select';

const MONO = { fontFamily: 'monospace' } as const;
const MODEL_PICKER = { width: 288, maxWidth: '100%' } as const;

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

export function ProviderBody({
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
