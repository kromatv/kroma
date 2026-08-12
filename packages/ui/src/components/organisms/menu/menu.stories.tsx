import { story } from '@kroma/workbench/story';
import { Pressable } from 'react-native';
import { Avatar } from '#ui/components/atoms/avatar';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Menu } from './menu';
import { menuItemVariants } from './menu-item';

const noop = () => {};

function RowActions({ align, danger }: Readonly<{ align: 'start' | 'end'; danger: boolean }>) {
  return (
    <Menu.Root label="Row actions" align={align}>
      <Menu.Trigger />
      <Menu.Item icon="player-pause" onSelect={noop}>
        Pause
      </Menu.Item>
      <Menu.Item icon="users-plus" onSelect={noop}>
        Ask for peers
      </Menu.Item>
      <Menu.Item icon="refresh" onSelect={noop}>
        Retry
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item icon="trash" tone={danger ? 'danger' : 'default'} onSelect={noop}>
        Remove
      </Menu.Item>
    </Menu.Root>
  );
}

/** The escape hatch: a trigger the caller owns, spread onto its own control. */
function AccountMenu() {
  return (
    <Menu.Root label="Account" align="start">
      <Menu.Trigger
        render={(bind) => (
          <Pressable
            ref={bind.ref}
            role="button"
            accessibilityLabel="Account"
            accessibilityState={{ expanded: bind.expanded }}
            onPress={bind.onPress}
          >
            <Box row align="center" gap={8} px={8} py={6} radius="pill" bg="surface2">
              <Avatar name="Max" size={24} />
              <Text variant="meta">Max</Text>
            </Box>
          </Pressable>
        )}
      />
      <Menu.Item icon="user-circle" onSelect={noop}>
        Account settings
      </Menu.Item>
      <Menu.Item icon="users" onSelect={noop}>
        Switch profile
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item icon="logout" tone="danger" onSelect={noop}>
        Sign out
      </Menu.Item>
    </Menu.Root>
  );
}

export default story({
  name: 'Menu',
  group: 'Overlays',
  docs: 'The anchored action menu behind a "..." trigger: a download row\'s pause/retry/remove, a card\'s overflow. Composed rather than configured: **Root** owns the open state, **Trigger** opens it, **Item** is one action and **Separator** is a part rather than a string in a list. Under a pointer it is an anchored panel with the full **menu keyboard** - arrows, type-ahead, Enter fires, Esc returns to the trigger - announced as `role="menu"` through `aria-activedescendant`; under a D-pad the items open in a dialog, confined to the remote. Every way out is reported: `onOpenChange(open, { reason })` says `select`, `outside`, `escape` or `back` - the remote\'s Back button.',
  usage: `<Menu.Root label={t('downloads.rowActions')} align="end">
  <Menu.Trigger />
  <Menu.Item icon="player-pause" onSelect={pause}>Pause</Menu.Item>
  <Menu.Item icon="refresh" onSelect={retry}>Retry</Menu.Item>
  <Menu.Separator />
  <Menu.Item icon="trash" tone="danger" onSelect={remove}>Remove</Menu.Item>
</Menu.Root>`,
  guidelines: {
    do: [
      'Order by frequency, destructive last after a <Menu.Separator>.',
      "Name the menu with Root's `label` - the trigger takes it as its accessible name.",
      'Reach for `render` when the trigger is not a round icon button; spread `bind` onto the control itself.',
    ],
    dont: [
      "Don't hide the row's ONE primary action in the overflow - promote it to its own button.",
      "Don't use a menu for navigation; menus fire actions.",
      "Don't nest a pressable inside <Menu.Trigger>: the trigger already presses.",
    ],
  },
  variants: menuItemVariants,
  matrix: false,
  pad: 120,
  args: { align: 'end' as 'start' | 'end', danger: true },
  controls: { align: ['end', 'start'] },
  render: ({ align, danger }) => (
    <Box row align="center" gap={16}>
      <Text color="textMuted">Interstellar.2014.2160p.mkv</Text>
      <RowActions align={align} danger={danger} />
    </Box>
  ),
  scenes: [
    {
      name: 'Its own trigger',
      docs: 'A trigger the caller owns through `render`, which is how an account chip opens a menu.',
      example: () => <AccountMenu />,
    },
  ],
});
