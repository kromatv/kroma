import { useLocale, useT } from '@kroma/ui';
import { ListRow, Txt } from '@kroma/ui/kit';
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
    <Txt
      style={{ fontSize: 15, fontWeight: '600' }}
      color={badge.tone === 'success' ? 'success' : 'textDim'}
    >
      {t(badge.label)}
    </Txt>
  );
}

function ChoiceRow({ item, first }: Readonly<{ item: ChoiceItem; first?: boolean }>) {
  const t = useT();
  const locale = useLocale();
  const [value, set] = item.use();
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
      <ListRow
        icon={item.icon}
        label={t(item.label)}
        autoFocus={first}
        onPress={list ? () => setPicking(true) : cycle}
        trailing={
          <Txt style={{ fontSize: 16, fontWeight: '600' }} color="accentText">
            {t(item.valueLabel(value))}
          </Txt>
        }
      />
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
  const [on, set] = item.use();
  return (
    <ListRow
      icon={item.icon}
      label={t(item.label)}
      autoFocus={first}
      onPress={() => set(!on)}
      trailing={
        <Badge
          badge={{ label: on ? 'profileMenu.on' : 'profileMenu.off', tone: on ? 'success' : 'dim' }}
        />
      }
    />
  );
}

function ActionRow({ item, first }: Readonly<{ item: ActionItem; first?: boolean }>) {
  const t = useT();
  return (
    <ListRow
      icon={item.icon}
      label={t(item.label)}
      autoFocus={first}
      onPress={item.run}
      trailing={item.badge ? <Badge badge={item.badge} /> : undefined}
    />
  );
}
