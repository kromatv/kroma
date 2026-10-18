import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Menu } from '#ui/components/organisms/menu';
import { CONTROL, type ControlSize } from '#ui/lib/field-shell';
import { useSelectionBar } from './selection-bar-context';
import { Item, type SelectionBarItemProps } from './selection-bar-parts';

const ROOM = { wide: 3, compact: 1 } as const;

interface SelectionBarActionsProps {
  /** Names the overflow menu, which takes the items past three, or past one when compact. */
  label: string;
  /** Only a direct Item can move into the menu; any other control stays on the bar. */
  children: ReactNode;
}

type ItemElement = ReactElement<SelectionBarItemProps>;

function isItem(node: ReactNode): node is ItemElement {
  return isValidElement(node) && node.type === Item;
}

/** What can be done to the selection, pinned to the end of the bar. */
function Actions({ label, children }: Readonly<SelectionBarActionsProps>) {
  const { compact, size } = useSelectionBar('Actions');
  const kids = Children.toArray(children);
  const items = kids.filter(isItem);
  const room = compact ? ROOM.compact : ROOM.wide;
  const kept = items.length > room ? items.slice(0, room) : items;
  return (
    <Box row align="center" justify="flex-end" grow={1} gap={8}>
      {kids.filter((node) => !isItem(node))}
      {kept}
      {items.length > kept.length ? (
        <Overflow label={label} size={size} items={items.slice(kept.length)} />
      ) : null}
    </Box>
  );
}

function Overflow({
  label,
  size,
  items,
}: Readonly<{ label: string; size: ControlSize; items: readonly ItemElement[] }>) {
  return (
    <Menu.Root label={label} align="end">
      <Menu.Trigger icon="dots" variant="ghost" control={size} diameter={CONTROL[size].height} />
      {items.flatMap((item, at) => {
        const { label: name, icon, tone, onPress, disabled, loading } = item.props;
        const danger = tone === 'danger';
        const turns = danger && at > 0 && items[at - 1]?.props.tone !== 'danger';
        const row = (
          <Menu.Item
            key={item.key}
            icon={icon}
            tone={danger ? 'danger' : 'default'}
            disabled={disabled === true || loading === true}
            onSelect={onPress}
          >
            {name}
          </Menu.Item>
        );
        return turns ? [<Menu.Separator key={`${item.key}:rule`} />, row] : [row];
      })}
    </Menu.Root>
  );
}

export type { SelectionBarActionsProps };
export { Actions };
