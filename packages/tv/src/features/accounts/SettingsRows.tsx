import { useLocale, useT } from '@kroma/ui';
import { ListRow, Text } from '@kroma/ui/kit';
import { useMemo, useState } from 'react';
import type {
  ActionItem,
  ChoiceItem,
  RowBadge,
  SettingsEntry,
  ToggleItem,
} from '#tv/app/settings/items';
import { ChoicePicker } from './ChoicePicker';

/** Each row is its own component so an item's `use()` hook sits in a stable
 * instance and an early return cannot break hook order (React #300). */
export function SettingsRows({ items }: Readonly<{ items: readonly SettingsEntry[] }>) {
  const visible = items.filter(
    (item): item is Exclude<SettingsEntry, false | null | undefined> =>
      item !== false && item != null && (!item.available || item.available()),
  );
  return (
    <>
      {visible.map((item, index) => {
        // First rendered row is the focus entry point: tvOS picks by geometry,
        // the web engine by DOM order.
        const first = index === 0;
        if (item.kind === 'choice') return <ChoiceRow key={item.id} item={item} first={first} />;
        if (item.kind === 'toggle') return <ToggleRow key={item.id} item={item} first={first} />;
        return <ActionRow key={item.id} item={item} first={first} />;
      })}
    </>
  );
}

function Badge({ badge }: Readonly<{ badge: RowBadge }>) {
  const t = useT();
  return (
    <Text variant="label" color={badge.tone === 'success' ? 'success' : 'textDim'}>
      {t(badge.label)}
    </Text>
  );
}

function ChoiceRow({ item, first }: Readonly<{ item: ChoiceItem; first?: boolean }>) {
  const t = useT();
  const locale = useLocale();
  const [value, set] = item.useValue();
  const [picking, setPicking] = useState(false);
  // A language row's options are ~190 names through a collator, and this list
  // re-renders whenever any pref on the menu changes.
  const options = useMemo(() => item.options(t, locale), [item, t, locale]);
  if (options.length < 2) return null;

  const cycle = () => {
    const next = options[(options.indexOf(value) + 1) % options.length];
    if (next) set(next);
  };

  const list = item.pick === 'list';

  return (
    <>
      <ListRow.Root
        icon={item.icon}
        autoFocus={first}
        onPress={list ? () => setPicking(true) : cycle}
      >
        <ListRow.Label>{t(item.label)}</ListRow.Label>
        <ListRow.Trailing>
          <Text variant="labelTv" color="accentText">
            {t(item.valueLabel(value))}
          </Text>
        </ListRow.Trailing>
      </ListRow.Root>
      {list ? (
        <ChoicePicker
          open={picking}
          onClose={() => setPicking(false)}
          title={t(item.label)}
          item={item}
          options={options}
          value={value}
          onPick={set}
        />
      ) : null}
    </>
  );
}

function ToggleRow({ item, first }: Readonly<{ item: ToggleItem; first?: boolean }>) {
  const t = useT();
  const [on, set] = item.useValue();
  return (
    <ListRow.Root
      icon={item.icon}
      autoFocus={first}
      role="switch"
      checked={on}
      onPress={() => set(!on)}
    >
      <ListRow.Label>{t(item.label)}</ListRow.Label>
      <ListRow.Trailing>
        <Badge
          badge={{ label: on ? 'profileMenu.on' : 'profileMenu.off', tone: on ? 'success' : 'dim' }}
        />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

function ActionRow({ item, first }: Readonly<{ item: ActionItem; first?: boolean }>) {
  const t = useT();
  return (
    <ListRow.Root icon={item.icon} autoFocus={first} onPress={item.run}>
      <ListRow.Label>{t(item.label)}</ListRow.Label>
      <ListRow.Trailing>{item.badge ? <Badge badge={item.badge} /> : null}</ListRow.Trailing>
    </ListRow.Root>
  );
}
