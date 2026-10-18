import { useT } from '@kromatv/module-sdk';
import { useCallback } from 'react';
import { factLabel } from './fact-labels';
import { LANGUAGE_PRESETS } from './language-presets';
import type { Condition } from './rules-schemas';

type Translate = ReturnType<typeof useT>;

function languageName(t: Translate, tag: string): string {
  const preset = LANGUAGE_PRESETS.find((one) => one.value === tag);
  return preset ? t(preset.labelKey) : tag || t('acq.anyValue');
}

function range(t: Translate, from: string | null, to: string | null): string {
  if (from && to) return t('acq.rangeBetween', { from, to });
  if (from) return t('acq.rangeFrom', { from });
  if (to) return t('acq.rangeTo', { to });
  return t('acq.anyValue');
}

function amount(value: number | null | undefined, unit: string): string | null {
  return value == null ? null : `${value} ${unit}`;
}

function year(value: number | null | undefined): string | null {
  return value == null ? null : String(value);
}

function audioValue(t: Translate, condition: Extract<Condition, { type: 'audio' }>): string {
  const parts = [
    condition.codec ? factLabel(condition.codec) : null,
    condition.minChannels == null
      ? null
      : t('acq.channelsAtLeast', { count: condition.minChannels }),
  ].filter((part) => part !== null);
  return parts.length === 0 ? t('acq.anyValue') : parts.join(' · ');
}

function testedValue(t: Translate, condition: Condition): string {
  switch (condition.type) {
    case 'releaseTitle':
    case 'releaseGroup':
    case 'edition':
      return condition.pattern || t('acq.anyValue');
    case 'language':
    case 'subtitle':
      return languageName(t, condition.value);
    case 'source':
    case 'resolution':
    case 'videoCodec':
      return factLabel(condition.value);
    case 'hdr':
      return condition.value ? factLabel(condition.value) : t('acq.anyHdr');
    case 'indexerFlag':
      return t(`acq.flag.${condition.value}`);
    case 'releaseType':
      return t(`acq.releaseType.${condition.value}`);
    case 'audio':
      return audioValue(t, condition);
    case 'size':
      return range(t, amount(condition.minGb, 'Go'), amount(condition.maxGb, 'Go'));
    case 'year':
      return range(t, year(condition.min), year(condition.max));
  }
}

/** What one condition tests, as a reader reads it: « Langue audio = VFF
 *  (France) ». The mode it is in is said by whatever draws the line. */
export function useConditionText(): (condition: Condition) => string {
  const t = useT();
  return useCallback(
    (condition) => {
      const key = `acq.condition.${condition.type}`;
      return `${t(key)} = ${testedValue(t, condition)}`;
    },
    [t],
  );
}
