import { styles, useBreakpoint, useStyles } from '@kromatv/ui/kit';
import { Box, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Divider } from '@kromatv/ui/kit/atoms/divider';
import { Focusable } from '@kromatv/ui/kit/atoms/focusable';
import { IconButton } from '@kromatv/ui/kit/atoms/icon-button';
import { Logo } from '@kromatv/ui/kit/atoms/logo';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { useLocation } from '@tanstack/react-router';
import { AccountMenu } from '#site/components/account-menu.component';
import { SearchButton } from '#site/components/search-button.component';
import { ThemeMenu } from '#site/components/theme-menu.component';
import { NavItem } from '#site/components/nav-item.component';
import { RouteLink } from '#site/components/route-link.component';
import { signInUrl } from '#site/lib/api-client';
import { sectionOf } from '#site/lib/sections';
import { useSite } from '#site/lib/use-site.hook';
import type { Viewer } from '#site/lib/views';

const sDefinition = styles({
  pinned: { position: 'sticky', top: 0, zIndex: 20 },
});

function Brand() {
  return (
    <Focusable ring asChild label="Lingua home">
      <RouteLink to="/">
        <Row gap={12} align="center">
          <Logo size={24} />
          <Box h={18} shrink={0}>
            <Divider vertical />
          </Box>
          <Text variant="label" color="text">
            Lingua
          </Text>
        </Row>
      </RouteLink>
    </Focusable>
  );
}

function Sections({ viewer, wide }: Readonly<{ viewer: Viewer | null; wide: boolean }>) {
  const here = sectionOf(useLocation({ select: (location) => location.pathname }));
  return (
    <Row gap={4} align="center" role="navigation" aria-label="Lingua">
      <NavItem
        to="/"
        icon={wide ? 'folders' : undefined}
        label="Projects"
        current={here === 'projects'}
      />
      {viewer ? (
        <NavItem
          to="/contributions"
          icon={wide ? 'git-pull-request' : undefined}
          label={wide ? 'My contributions' : 'Contributions'}
          current={here === 'contributions'}
        />
      ) : null}
      <NavItem
        to="/setup"
        icon={wide ? 'activity' : undefined}
        label="Status"
        current={here === 'status'}
      />
    </Row>
  );
}

function GitHubSignIn({ wide }: Readonly<{ wide: boolean }>) {
  const here = useLocation({ select: (location) => location.href });
  const href = signInUrl(here);
  if (wide) {
    return (
      <Button
        variant="glass"
        size="sm"
        icon="brand-github"
        label="Sign in with GitHub"
        href={href}
        role="link"
      />
    );
  }
  return (
    <IconButton
      variant="glass"
      diameter={44}
      glyph={20}
      icon="brand-github"
      label="Sign in with GitHub"
      href={href}
      role="link"
    />
  );
}

function SignIn({ wide }: Readonly<{ wide: boolean }>) {
  if (useSite()?.signIn !== false) {
    return <GitHubSignIn wide={wide} />;
  }
  return wide ? (
    <Button variant="ghost" size="sm" icon="settings" label="Set up sign-in" asChild>
      <RouteLink to="/setup" />
    </Button>
  ) : null;
}

/**
 * Lingua's header, pinned to the top of the window: the mark, the sections
 * with the current one marked, the command menu, the theme, and the account
 * menu or a way to sign in. On a phone the sections take a second line.
 * `onHeight` hears how tall it stands each time that changes.
 */
export function LinguaHeader({ onHeight }: Readonly<{ onHeight: (height: number) => void }>) {
  const s = useStyles(sDefinition);
  const viewer = useSite()?.viewer ?? null;
  const wide = useBreakpoint() !== 'base';
  return (
    <Box
      style={s.pinned}
      bg="surface1"
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
    >
      <Box px={16} py={10}>
        <Box w="100%" maxW={1080} mx="auto" gap={6}>
          <Row gap={12} between align="center">
            <Row gap={20} align="center" shrink={1} minW={0}>
              <Brand />
              {wide ? <Sections viewer={viewer} wide /> : null}
            </Row>
            <Row gap={8} align="center" shrink={0}>
              <SearchButton wide={wide} />
              <ThemeMenu />
              {viewer ? <AccountMenu viewer={viewer} /> : <SignIn wide={wide} />}
            </Row>
          </Row>
          {wide ? null : <Sections viewer={viewer} wide={false} />}
        </Box>
      </Box>
      <Divider />
    </Box>
  );
}
