import { useLocale, useT } from '@kromatv/ui';
import { useMemo } from 'react';
import type { ChoiceItem, SettingsItem } from '#tv/app/settings/items';

/** A group's current values on one line, each choice read through its own hook. */
export function GroupSummary({ items }: Readonly<{ items: readonly SettingsItem[] }>) {
  const choices = items.filter(
    (item): item is ChoiceItem => item.kind === 'choice' && (!item.available || item.available()),
  );
  return (
    <>
      {choices.map((item, index) => (
        <SummaryPart key={item.id} item={item} lead={index > 0} />
      ))}
    </>
  );
}

function SummaryPart({ item, lead }: Readonly<{ item: ChoiceItem; lead: boolean }>) {
  const t = useT();
  const locale = useLocale();
  const [value] = item.useValue();
  const options = useMemo(() => item.options(t, locale), [item, t, locale]);
  if (options.length < 2) return null;
  const label = t(item.valueLabel(value));
  const text = item.summary ? t(item.summary, { value: label }) : label;
  return `${lead ? ' · ' : ''}${text}`;
}
