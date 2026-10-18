import { useT } from '@kromatv/module-sdk';
import { Box, Row } from '@kromatv/ui/kit';
import { Choice, Count, Entry } from './condition-fields';
import { ConditionLanguage } from './condition-language';
import {
  AudioCodec,
  type Condition,
  HdrFormat,
  IndexerFlag,
  ReleaseType,
  Resolution,
  Source,
  VideoCodec,
} from './rules-schemas';

const VALUE_W = 210;

type Of<Type extends Condition['type']> = Extract<Condition, { type: Type }>;

export function ConditionValue({
  condition,
  onChange,
}: Readonly<{
  condition: Condition;
  onChange: (next: Condition) => void;
}>) {
  const t = useT();
  const label = t('acq.conditionValue');
  switch (condition.type) {
    case 'releaseTitle':
    case 'releaseGroup':
    case 'edition':
      return (
        <Box flex minW={220}>
          <Entry
            label={t('acq.conditionPattern')}
            placeholder="VFF|TRUEFRENCH"
            value={condition.pattern}
            onPick={(pattern) => onChange({ ...condition, pattern })}
          />
        </Box>
      );
    case 'language':
    case 'subtitle':
      return (
        <ConditionLanguage
          label={t(`acq.condition.${condition.type}`)}
          value={condition.value}
          onPick={(value) => onChange({ ...condition, value })}
        />
      );
    case 'audio':
      return <AudioValue condition={condition} onChange={onChange} />;
    case 'size':
      return <SizeValue condition={condition} onChange={onChange} />;
    case 'source':
      return (
        <Box w={VALUE_W}>
          <Choice
            label={label}
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
            options={IndexerFlag.options}
            value={condition.value}
            labelOf={(flag) => t(`acq.flag.${flag}`)}
            onPick={(value) => value && onChange({ ...condition, value })}
          />
        </Box>
      );
    case 'releaseType':
      return (
        <Box w={VALUE_W}>
          <Choice
            label={label}
            options={ReleaseType.options}
            value={condition.value}
            labelOf={(kind) => t(`acq.releaseType.${kind}`)}
            onPick={(value) => value && onChange({ ...condition, value })}
          />
        </Box>
      );
    case 'year':
      return <YearValue condition={condition} onChange={onChange} />;
    case 'hdr':
      return (
        <Box w={VALUE_W}>
          <Choice
            label={label}
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
  onChange,
}: Readonly<{
  condition: Of<'audio'>;
  onChange: (next: Condition) => void;
}>) {
  const t = useT();
  return (
    <Row wrap gap={10} align="flex-end">
      <Box w={170}>
        <Choice
          label={t('acq.conditionAudioCodec')}
          anyLabel={t('acq.anyValue')}
          options={AudioCodec.options}
          value={condition.codec ?? null}
          onPick={(codec) => onChange({ ...condition, codec })}
        />
      </Box>
      <Box w={130}>
        <Count
          label={t('acq.conditionMinChannels')}
          placeholder="6"
          value={condition.minChannels}
          onPick={(minChannels) => onChange({ ...condition, minChannels })}
        />
      </Box>
    </Row>
  );
}

function YearValue({
  condition,
  onChange,
}: Readonly<{
  condition: Of<'year'>;
  onChange: (next: Condition) => void;
}>) {
  const t = useT();
  return (
    <Row wrap gap={10} align="flex-end">
      <Box w={120}>
        <Count
          label={t('acq.conditionMinYear')}
          placeholder="2010"
          value={condition.min}
          onPick={(min) => onChange({ ...condition, min })}
        />
      </Box>
      <Box w={120}>
        <Count
          label={t('acq.conditionMaxYear')}
          placeholder="2026"
          value={condition.max}
          onPick={(max) => onChange({ ...condition, max })}
        />
      </Box>
    </Row>
  );
}

function SizeValue({
  condition,
  onChange,
}: Readonly<{
  condition: Of<'size'>;
  onChange: (next: Condition) => void;
}>) {
  const t = useT();
  return (
    <Row wrap gap={10} align="flex-end">
      <Box w={140}>
        <Count
          label={t('acq.conditionMinGb')}
          placeholder="0"
          value={condition.minGb}
          onPick={(minGb) => onChange({ ...condition, minGb })}
        />
      </Box>
      <Box w={140}>
        <Count
          label={t('acq.conditionMaxGb')}
          placeholder="80"
          value={condition.maxGb}
          onPick={(maxGb) => onChange({ ...condition, maxGb })}
        />
      </Box>
    </Row>
  );
}
