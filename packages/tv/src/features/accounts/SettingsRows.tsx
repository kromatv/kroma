import { useLocale, useT } from '@kromatv/ui';
import { type FocusHandle, ListRow, Text } from '@kromatv/ui/kit';
import { type Ref, useMemo, useState } from 'react';
import type { ChoiceItem, SettingsEntry, ToggleItem } from '#tv/app/settings/items';
import { ChoicePicker } from './ChoicePicker';

/** Each row is its own component so an item's `use()` hook sits in a stable
 * instance and an early return cannot break hook order (React #300). */
export function SettingsRows({
  items,
  entry = true,
  firstHandle,
}: Readonly<{ items: readonly SettingsEntry[]; entry?: boolean; firstHandle?: Ref<FocusHandle> }>) {
  const visible = items.filter(
    (item): item is Exclude<SettingsEntry, false | null | undefined> =>
      item !== false && item != null && (!item.available || item.available()),
  );
  return (
    <>
      {visible.map((item, index) => {
        // First rendered row is the focus entry point: tvOS picks by geometry,
        // the web engine by DOM order.
        const first = entry && index === 0;
        const handle = index === 0 ? firstHandle : undefined;
        if (item.kind === 'choice') {
          return <ChoiceRow key={item.id} item={item} first={first} handle={handle} />;
        }
        return <ToggleRow key={item.id} item={item} first={first} handle={handle} />;
      })}
    </>
  );
}

function OnOff({ on }: Readonly<{ on: boolean }>) {
  const t = useT();
  return (
    <Text variant="label" color={on ? 'success' : 'textDim'}>
      {t(on ? 'profileMenu.on' : 'profileMenu.off')}
    </Text>
  );
}

function ChoiceRow({
  item,
  first,
  handle,
}: Readonly<{ item: ChoiceItem; first?: boolean; handle?: Ref<FocusHandle> }>) {
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
        ground="surface"
        icon={item.icon}
        autoFocus={first}
        focusHandle={handle}
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

function ToggleRow({
  item,
  first,
  handle,
}: Readonly<{ item: ToggleItem; first?: boolean; handle?: Ref<FocusHandle> }>) {
  const t = useT();
  const [on, set] = item.useValue();
  return (
    <ListRow.Root
      ground="surface"
      icon={item.icon}
      autoFocus={first}
      focusHandle={handle}
      role="switch"
      checked={on}
      onPress={() => set(!on)}
    >
      <ListRow.Label>{t(item.label)}</ListRow.Label>
      <ListRow.Trailing>
        <OnOff on={on} />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}
