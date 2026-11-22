import type { NewKidsProfile } from '@kromatv/client/admin';
import { KIDS_LEVELS } from '@kromatv/core';
import { ChoiceList } from '#ui/components/molecules/choice-list';
import { type ControlSize, useEntryDefaults } from '#ui/lib/field-shell';
import { useTDefault } from '#ui/services/i18n';

type KidsLevel = NewKidsProfile['level'];

export interface KidsLevelChoiceProps {
  /** `null` until one is picked: a level is never picked in advance. */
  value: KidsLevel | null;
  onValueChange: (level: KidsLevel) => void;
  /** Defaults to the form factor's control size, as a `ListRow` beside it does. */
  size?: ControlSize;
}

/** The levels a Kids profile is made at, All ages, 7+ and 10+, one row each
 *  with the ages it suits. */
export function KidsLevelChoice({
  value,
  onValueChange,
  size = 'md',
}: Readonly<KidsLevelChoiceProps>) {
  const t = useTDefault();
  const entry = useEntryDefaults();
  const shell = size ?? entry.size;
  const pick = (picked: string) => {
    const level = KIDS_LEVELS.find((candidate) => String(candidate) === picked);
    if (level !== undefined) {
      onValueChange(level);
    }
  };
  return (
    <ChoiceList.Root
      size={shell}
      label={t('admin.maturity')}
      value={value === null ? '' : String(value)}
      onValueChange={pick}
    >
      {KIDS_LEVELS.map((level) => (
        <ChoiceList.Item key={level} value={String(level)}>
          <ChoiceList.Label>{t(`content.maturity${level}`)}</ChoiceList.Label>
          <ChoiceList.Hint>{t(`admin.kidsBand${level}`)}</ChoiceList.Hint>
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}
