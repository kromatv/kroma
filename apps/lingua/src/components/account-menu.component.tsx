import { CONTROL, type StyleDecl, svFor, useBreakpoint } from '@kromatv/ui/kit';
import { Avatar } from '@kromatv/ui/kit/atoms/avatar';
import { Box, Row } from '@kromatv/ui/kit/atoms/box';
import { Focusable } from '@kromatv/ui/kit/atoms/focusable';
import { Icon } from '@kromatv/ui/kit/atoms/icon';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { Menu, type MenuTriggerBind } from '@kromatv/ui/kit/organisms/menu';
import { OutsideLink } from '#site/components/outside-link.component';
import { RouteLink } from '#site/components/route-link.component';
import { profileUrl } from '#site/lib/github-links';
import { useSignOut } from '#site/lib/use-sign-out.hook';
import type { Viewer } from '#site/lib/views';

const trigger = svFor<{ root: StyleDecl; glyph: { color: string } }>()({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 8,
      minH: 44,
      pl: 4,
      pr: 8,
      radius: CONTROL.sm.radius,
      _hover: { bg: 'tint/5' },
    },
    glyph: { color: 'textDim', _hover: { color: 'text' } },
  },
  variants: { open: { true: { root: { bg: 'tint/7' } } } },
  defaults: { open: false },
});

function Who({ viewer, size }: Readonly<{ viewer: Viewer; size: number }>) {
  return <Avatar name={viewer.name ?? viewer.login} src={viewer.avatarUrl} size={size} circle />;
}

function Names({ viewer }: Readonly<{ viewer: Viewer }>) {
  return (
    <Box shrink={1} minW={0}>
      <Text variant="label" lines={1}>
        {viewer.name ?? viewer.login}
      </Text>
      <Text variant="meta" color="textDim" lines={1}>
        {`@${viewer.login}`}
      </Text>
    </Box>
  );
}

function TriggerFace({ viewer, glyph }: Readonly<{ viewer: Viewer; glyph: string }>) {
  const step = useBreakpoint();
  const wide = step === 'lg' || step === 'tv';
  return (
    <>
      <Who viewer={viewer} size={30} />
      {wide ? (
        <Box maxW={160}>
          <Text variant="label" lines={1}>
            {viewer.name ?? viewer.login}
          </Text>
        </Box>
      ) : null}
      <Icon name="chevron-down" size={16} color={glyph} />
    </>
  );
}

function Trigger({ bind, viewer }: Readonly<{ bind: MenuTriggerBind; viewer: Viewer }>) {
  const { ref, expanded, onPress } = bind;
  return (
    <Focusable
      ref={ref}
      sv={trigger}
      vars={{ open: expanded }}
      expanded={expanded}
      label={`Account, signed in as ${viewer.login}`}
      onPress={onPress}
    >
      {({ slots }) => <TriggerFace viewer={viewer} glyph={slots.glyph.color} />}
    </Focusable>
  );
}

const triggerFor = (viewer: Viewer) => (bind: MenuTriggerBind) => (
  <Trigger bind={bind} viewer={viewer} />
);

/** The signed-in contributor's account control: who they are, their contributions, their GitHub profile, and signing out. */
export function AccountMenu({ viewer }: Readonly<{ viewer: Viewer }>) {
  const signOut = useSignOut();
  return (
    <Menu.Root label="Account" align="end">
      <Menu.Trigger render={triggerFor(viewer)} />
      <Menu.Header>
        <Row gap={10} align="center" maxW={240}>
          <Who viewer={viewer} size={36} />
          <Names viewer={viewer} />
        </Row>
      </Menu.Header>
      <Menu.Separator />
      <Menu.Item icon="git-pull-request" label="My contributions" asChild>
        <RouteLink to="/contributions" />
      </Menu.Item>
      <Menu.Item icon="brand-github" label="Your GitHub profile" asChild>
        <OutsideLink to={profileUrl(viewer.login)} />
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item icon="logout" label="Sign out" tone="danger" onSelect={() => void signOut()} />
    </Menu.Root>
  );
}
