import {
  flagRegion,
  groupLocales,
  type LocaleChoice,
  type LocaleGroups,
  suggestedLocales,
} from '@kromatv/core';
import { useState } from 'react';
import { Badge } from '#ui/components/atoms/badge';
import { Box } from '#ui/components/atoms/box';
import { Flag, isFlagRegion } from '#ui/components/atoms/flag';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { ListRow } from '#ui/components/molecules/list-row';
import type { ControlSize } from '#ui/lib/field-shell';
import { useTDefault } from '#ui/services/i18n';
import { type LanguagePickerState, useLanguagePicker } from './language-picker-context';

const MARK: Record<ControlSize, number> = { sm: 14, md: 16, tv: 22 };
const CHECK: Record<ControlSize, number> = { sm: 16, md: 18, tv: 24 };

/** The flag that stands for a language, or the neutral language glyph in the
 *  same box where no flag does. */
function Mark({ code, size }: Readonly<{ code: string; size: ControlSize }>) {
  const height = MARK[size];
  const region = flagRegion(code);
  if (isFlagRegion(region)) {
    return <Flag region={region} height={height} />;
  }
  return (
    <Box w={height * 1.5} h={height} radius="xs" bg="tint/8" center shrink={0}>
      <Icon name="language" size={Math.round(height * 0.8)} color="textMuted" />
    </Box>
  );
}

const RADIO = 'radio';

function Tail({ choice, picked }: Readonly<{ choice: LocaleChoice; picked: boolean }>) {
  const t = useTDefault();
  const { size } = useLanguagePicker('List');
  return (
    <>
      {choice.beta ? (
        <Badge tone="neutral" size={size === 'tv' ? 'tv' : 'sm'}>
          {t('common.beta')}
        </Badge>
      ) : null}
      <Box w={CHECK[size]} align="center">
        {picked ? (
          <Icon name="check" size={CHECK[size]} thickness={2.4} color="accentText" />
        ) : null}
      </Box>
    </>
  );
}

function Row({ choice }: Readonly<{ choice: LocaleChoice }>) {
  const { value, size, entry, searchable, select } = useLanguagePicker('List');
  const picked = choice.code === value;
  const named = choice.name !== choice.endonym;
  return (
    <ListRow.Root
      role={RADIO}
      checked={picked}
      chevron={false}
      size={size}
      label={named ? `${choice.endonym}, ${choice.name}` : choice.endonym}
      autoFocus={picked && entry && !searchable}
      onPress={() => select(choice.code)}
    >
      <ListRow.Leading>
        <Mark code={choice.code} size={size} />
      </ListRow.Leading>
      <ListRow.Label lang={choice.code}>{choice.endonym}</ListRow.Label>
      {named ? <ListRow.Hint lines={1}>{choice.name}</ListRow.Hint> : null}
      <ListRow.Trailing>
        <Tail choice={choice} picked={picked} />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

function Rows({
  choices,
  size,
}: Readonly<{ choices: readonly LocaleChoice[]; size: ControlSize }>) {
  return (
    <ListRow.Group size={size}>
      {choices.map((choice) => (
        <Row key={choice.code} choice={choice} />
      ))}
    </ListRow.Group>
  );
}

function Heading({ children, size }: Readonly<{ children: string; size: ControlSize }>) {
  return (
    <Text variant={size === 'tv' ? 'overlineTv' : 'overline'} color="textDim" px={4}>
      {children}
    </Text>
  );
}

function useGroups(state: LanguagePickerState): LocaleGroups | null {
  const { choices, value, device, long } = state;
  const [suggested] = useState(() =>
    suggestedLocales(
      choices.map((choice) => choice.code),
      { picked: value, device },
    ),
  );
  if (!long) {
    return null;
  }
  const groups = groupLocales(choices, suggested);
  return groups.suggested.length > 0 && groups.others.length > 0 ? groups : null;
}

/** The languages, one row each, the whole row the control. A long list leads
 *  with the few a reader most likely wants, the one picked and the ones the
 *  device asks for, as they stood when the list was first drawn, so a pick
 *  does not make its row jump; while a search runs, only what it found. */
function List() {
  const t = useTDefault();
  const state = useLanguagePicker('List');
  const groups = useGroups(state);
  const { label, size, matches, choices } = state;
  if (matches?.length === 0) {
    return null;
  }
  if (matches || !groups) {
    return (
      <Box role="radiogroup" accessibilityLabel={label}>
        <Rows choices={matches ?? choices} size={size} />
      </Box>
    );
  }
  return (
    <Box role="radiogroup" accessibilityLabel={label} gap={8}>
      <Heading size={size}>{t('common.languageSuggested')}</Heading>
      <Rows choices={groups.suggested} size={size} />
      <Box h={8} />
      <Heading size={size}>{t('common.languageAll')}</Heading>
      <Rows choices={groups.others} size={size} />
    </Box>
  );
}

/** What stands in place of the list while a search finds nothing. */
function Empty() {
  const t = useTDefault();
  const { matches } = useLanguagePicker('Empty');
  if (matches?.length !== 0) {
    return null;
  }
  return (
    <Text variant="meta" color="textMuted" py={8}>
      {t('common.languageNone')}
    </Text>
  );
}

export { Empty, List, Mark, MARK };
