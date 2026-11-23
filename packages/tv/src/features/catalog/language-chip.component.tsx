import {
  ANY_LANGUAGE,
  LANGUAGE_FILTER_LABEL,
  type LanguageCount,
  type LanguageStream,
  langName,
  languageChoices,
} from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Chip, type IconName, Select } from '@kromatv/ui/kit';
import { useState } from 'react';

const ICON: Record<LanguageStream, IconName> = { audio: 'volume', subtitles: 'badge-cc' };

export interface LanguageChipProps {
  stream: LanguageStream;
  languages: LanguageCount[];
  value: string | undefined;
  onValueChange: (code: string | undefined) => void;
}

/** A browse filter on the language a title is heard or read in: a chip that
 * names the pick and opens the languages the section has, with how many titles
 * have each. */
export function LanguageChip(props: Readonly<LanguageChipProps>) {
  const { stream, value, onValueChange } = props;
  const t = useT();
  const [open, setOpen] = useState(false);
  const label = t(LANGUAGE_FILTER_LABEL[stream]);
  return (
    <Select.Root
      open={open}
      onOpenChange={setOpen}
      presentation="dialog"
      label={label}
      value={value ?? ANY_LANGUAGE}
      onValueChange={(code) => onValueChange(code === ANY_LANGUAGE ? undefined : code)}
    >
      <Chip
        variant="subtle"
        focusScale={1.06}
        active={value !== undefined}
        expanded={open}
        icon={ICON[stream]}
        label={chipLabel(t, value) ?? label}
        onPress={() => setOpen(true)}
      />
      {languageItems(t, stream, props.languages)}
    </Select.Root>
  );
}

function languageItems(t: Translate, stream: LanguageStream, languages: LanguageCount[]) {
  return [
    <Select.Item key={ANY_LANGUAGE} value={ANY_LANGUAGE} label={t('browse.anyLanguage')} />,
    ...languageChoices(t, languages).map((choice) => (
      <Select.Item key={choice.value} icon={ICON[stream]} {...choice} />
    )),
  ];
}

function chipLabel(t: Translate, value: string | undefined): string | undefined {
  return value ? (langName(t, value) ?? value) : undefined;
}
