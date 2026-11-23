import {
  ANY_LANGUAGE,
  LANGUAGE_FILTER_LABEL,
  type LanguageCount,
  type LanguageStream,
  languageChoices,
} from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { type IconName, Select, styles, useStyles } from '@kromatv/ui/kit';

const ICON: Record<LanguageStream, IconName> = { audio: 'volume', subtitles: 'badge-cc' };

const sDefinition = styles({
  trigger: { shrink: 0, minW: 150 },
});

export interface LanguageSelectProps {
  stream: LanguageStream;
  languages: LanguageCount[];
  value?: string;
  onValueChange: (code: string | undefined) => void;
}

/** A browse filter on the languages a title is heard or read in, listing the
 * ones the catalogue has with how many titles have each. Draws nothing when no
 * title names one. */
export function LanguageSelect({
  stream,
  languages,
  value,
  onValueChange,
}: Readonly<LanguageSelectProps>) {
  const t = useT();
  const s = useStyles(sDefinition);
  if (languages.length === 0) {
    return null;
  }
  const label = t(LANGUAGE_FILTER_LABEL[stream]);
  return (
    <Select.Root
      label={label}
      placeholder={label}
      value={value ?? ''}
      onValueChange={(v) => onValueChange(v === ANY_LANGUAGE ? undefined : v)}
    >
      <Select.Trigger size="sm" style={s.trigger} />
      <Select.Item value={ANY_LANGUAGE} label={t('browse.anyLanguage')} />
      {languageChoices(t, languages).map((choice) => (
        <Select.Item key={choice.value} icon={ICON[stream]} {...choice} />
      ))}
    </Select.Root>
  );
}
