import { type LanguageCount, type LanguageStream, langName } from '@kromatv/core';
import type { MessageKey, Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { type IconName, Select, styles, useStyles } from '@kromatv/ui/kit';

const ANY_LANGUAGE = '*';

const STREAM: Record<LanguageStream, { label: MessageKey; icon: IconName }> = {
  audio: { label: 'browse.audioLanguage', icon: 'volume' },
  subtitles: { label: 'browse.subtitleLanguage', icon: 'badge-cc' },
};

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
  const { label, icon } = STREAM[stream];
  return (
    <Select.Root
      label={t(label)}
      placeholder={t(label)}
      value={value ?? ''}
      onValueChange={(v) => onValueChange(v === ANY_LANGUAGE ? undefined : v)}
    >
      <Select.Trigger size="sm" style={s.trigger} />
      <Select.Item value={ANY_LANGUAGE} label={t('browse.anyLanguage')} />
      {languageItems(t, languages, icon)}
    </Select.Root>
  );
}

function languageItems(t: Translate, languages: LanguageCount[], icon: IconName) {
  return languages.map((language) => (
    <Select.Item
      key={language.code}
      value={language.code}
      label={langName(t, language.code) ?? language.code}
      icon={icon}
      note={String(language.count)}
    />
  ));
}
