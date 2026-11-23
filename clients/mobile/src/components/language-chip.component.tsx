import {
  ANY_LANGUAGE,
  LANGUAGE_FILTER_LABEL,
  type LanguageCount,
  type LanguageStream,
  langName,
  languageChoices,
} from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import { Box, Chip, Icon, type IconName } from '@kromatv/ui/kit';
import { useRef, useState } from 'react';
import type { View } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import {
  measureAnchor,
  type PopoverAnchor,
  type PopoverItem,
  PopoverMenu,
} from './popover-menu.component';

const ICON: Record<LanguageStream, IconName> = { audio: 'volume', subtitles: 'badge-cc' };

export interface LanguageChipProps {
  stream: LanguageStream;
  languages: LanguageCount[];
  value: string | undefined;
  onValueChange: (code: string | undefined) => void;
}

/** A catalogue filter on the language a title is heard or read in: a chip that
 * names the pick and opens the languages the tab's titles carry, with how many
 * titles have each. */
export function LanguageChip(props: Readonly<LanguageChipProps>) {
  const { stream, value } = props;
  const t = useT();
  const button = useRef<View>(null);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const open = () => measureAnchor(button.current, setAnchor);
  return (
    <>
      <Box ref={button}>
        <Chip
          variant="subtle"
          icon={ICON[stream]}
          active={value !== undefined}
          label={chipLabel(t, value) ?? t(LANGUAGE_FILTER_LABEL[stream])}
          onPress={open}
        >
          <Icon name="chevron-down" size={14} thickness={2} color="textMuted" />
        </Chip>
      </Box>
      <PopoverMenu
        visible={anchor !== null}
        anchor={anchor}
        onClose={() => setAnchor(null)}
        items={languageItems(t, props)}
      />
    </>
  );
}

function languageItems(t: Translate, props: Readonly<LanguageChipProps>): PopoverItem[] {
  const { languages, value, onValueChange } = props;
  return [
    {
      key: ANY_LANGUAGE,
      label: t('browse.anyLanguage'),
      active: value === undefined,
      onPress: () => onValueChange(undefined),
    },
    ...languageChoices(t, languages).map((choice) => ({
      key: choice.value,
      label: choice.label,
      detail: choice.note,
      active: choice.value === value,
      onPress: () => onValueChange(choice.value),
    })),
  ];
}

function chipLabel(t: Translate, value: string | undefined): string | undefined {
  return value ? (langName(t, value) ?? value) : undefined;
}
