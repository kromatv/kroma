import { useT } from '@kromatv/module-sdk';
import { Box, Field, Row, Select, Text } from '@kromatv/ui/kit';
import {
  AudioCodec,
  type Condition,
  HdrFormat,
  IndexerFlag,
  Resolution,
  Source,
  VideoCodec,
} from './rules-schemas';

const ANY = '*';
const VALUE_W = 190;

type Of<Type extends Condition['type']> = Extract<Condition, { type: Type }>;

export function ConditionValue({
  condition,
  labelled,
  onChange,
}: Readonly<{
  condition: Condition;
  labelled: boolean;
  onChange: (next: Condition) => void;
}>) {
  const t = useT();
  const label = t('acq.conditionValue');
  switch (condition.type) {
    case 'releaseTitle':
    case 'releaseGroup':
    case 'edition':
      return (
        <Box flex minW={180}>
          <Entry
            label={t('acq.conditionPattern')}
            labelled={labelled}
            placeholder="VFF|TRUEFRENCH"
            value={condition.pattern}
            onPick={(pattern) => onChange({ ...condition, pattern })}
          />
        </Box>
      );
    case 'language':
    case 'subtitle':
      return (
        <Box w={VALUE_W}>
          <Entry
            label={t('acq.conditionTag')}
            labelled={labelled}
            placeholder="fr-CA"
            value={condition.value}
            onPick={(value) => onChange({ ...condition, value })}
          />
        </Box>
      );
    case 'audio':
      return <AudioValue condition={condition} labelled={labelled} onChange={onChange} />;
    case 'size':
      return <SizeValue condition={condition} labelled={labelled} onChange={onChange} />;
    case 'source':
      return (
        <Box w={VALUE_W}>
          <Choice
            label={label}
            labelled={labelled}
            options={Source.options}
            value={condition.value}
            onPick={(value) => value && onChange({ ...condition, value })}
          />
        </Box>
      );
    case 'resolution':
      return (
        <Box w={VALUE_W}>
          <Choice
            label={label}
            labelled={labelled}
            options={Resolution.options}
            value={condition.value}
            onPick={(value) => value && onChange({ ...condition, value })}
          />
        </Box>
      );
    case 'videoCodec':
      return (
        <Box w={VALUE_W}>
          <Choice
            label={label}
            labelled={labelled}
            options={VideoCodec.options}
            value={condition.value}
            onPick={(value) => value && onChange({ ...condition, value })}
          />
        </Box>
      );
    case 'indexerFlag':
      return (
        <Box w={VALUE_W}>
          <Choice
            label={label}
            labelled={labelled}
            options={IndexerFlag.options}
            value={condition.value}
            onPick={(value) => value && onChange({ ...condition, value })}
          />
        </Box>
      );
    case 'hdr':
      return (
        <Box w={VALUE_W}>
          <Choice
            label={label}
            labelled={labelled}
            anyLabel={t('acq.anyHdr')}
            options={HdrFormat.options}
            value={condition.value ?? null}
            onPick={(value) => onChange({ ...condition, value })}
          />
        </Box>
      );
  }
}

function AudioValue({
  condition,
  labelled,
  onChange,
}: Readonly<{
  condition: Of<'audio'>;
  labelled: boolean;
  onChange: (next: Condition) => void;
}>) {
  const t = useT();
  return (
    <Row wrap gap={10} align="flex-end">
      <Box w={160}>
        <Choice
          label={t('acq.conditionAudioCodec')}
          labelled={labelled}
          anyLabel={t('acq.anyValue')}
          options={AudioCodec.options}
          value={condition.codec ?? null}
          onPick={(codec) => onChange({ ...condition, codec })}
        />
      </Box>
      <Box w={140}>
        <Count
          label={t('acq.conditionMinChannels')}
          labelled={labelled}
          placeholder="6"
          value={condition.minChannels}
          onPick={(minChannels) => onChange({ ...condition, minChannels })}
        />
      </Box>
    </Row>
  );
}

function SizeValue({
  condition,
  labelled,
  onChange,
}: Readonly<{
  condition: Of<'size'>;
  labelled: boolean;
  onChange: (next: Condition) => void;
}>) {
  const t = useT();
  return (
    <Row wrap gap={10} align="flex-end">
      <Box w={120}>
        <Count
          label={t('acq.conditionMinGb')}
          labelled={labelled}
          placeholder="0"
          value={condition.minGb}
          onPick={(minGb) => onChange({ ...condition, minGb })}
        />
      </Box>
      <Box w={120}>
        <Count
          label={t('acq.conditionMaxGb')}
          labelled={labelled}
          placeholder="80"
          value={condition.maxGb}
          onPick={(maxGb) => onChange({ ...condition, maxGb })}
        />
      </Box>
    </Row>
  );
}

function Entry({
  label,
  labelled,
  placeholder,
  value,
  onPick,
}: Readonly<{
  label: string;
  labelled: boolean;
  placeholder: string;
  value: string;
  onPick: (next: string) => void;
}>) {
  return (
    <Field.Root label={label} hideLabel={!labelled} size="sm" value={value} onValueChange={onPick}>
      <Field.Input placeholder={placeholder} />
    </Field.Root>
  );
}

function Count({
  label,
  labelled,
  placeholder,
  value,
  onPick,
}: Readonly<{
  label: string;
  labelled: boolean;
  placeholder: string;
  value: number | null | undefined;
  onPick: (next: number | null) => void;
}>) {
  return (
    <Field.Root
      label={label}
      hideLabel={!labelled}
      size="sm"
      value={value == null ? '' : String(value)}
      onValueChange={(text) => onPick(readCount(text))}
    >
      <Field.Input type="number" placeholder={placeholder} />
    </Field.Root>
  );
}

function readCount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function Choice<Option extends string>({
  label,
  labelled,
  anyLabel,
  options,
  value,
  onPick,
}: Readonly<{
  label: string;
  labelled: boolean;
  anyLabel?: string;
  options: readonly Option[];
  value: Option | null;
  onPick: (next: Option | null) => void;
}>) {
  return (
    <Box gap={6}>
      {labelled ? (
        <Text variant="meta" color="textMuted">
          {label}
        </Text>
      ) : null}
      <Select.Root
        label={label}
        value={value ?? ANY}
        onValueChange={(next) => onPick(options.find((option) => option === next) ?? null)}
      >
        <Select.Trigger size="sm" block />
        {anyLabel ? <Select.Item value={ANY} label={anyLabel} /> : null}
        {options.map((option) => (
          <Select.Item key={option} value={option} label={option} />
        ))}
      </Select.Root>
    </Box>
  );
}
