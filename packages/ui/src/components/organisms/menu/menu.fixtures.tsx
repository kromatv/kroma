import { Pressable } from 'react-native';

import { Avatar } from '#ui/components/atoms/avatar';

import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

import { Menu } from './menu';

export const noop = () => {};

export function RowActions({
  align,
  danger,
}: Readonly<{ align: 'start' | 'end'; danger: boolean }>) {
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

export /** The escape hatch: a trigger the caller owns, spread onto its own control. */
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
