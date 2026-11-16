import { SiteHeader } from '@kromatv/site-kit/site-header';
import { Avatar } from '@kromatv/ui/kit/atoms/avatar';
import { Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { IconButton } from '@kromatv/ui/kit/atoms/icon-button';
import { useLocation, useRouter } from '@tanstack/react-router';
import { signInUrl } from '#site/lib/api-client';
import type { Viewer } from '#site/lib/views';

function SignedIn({ viewer }: Readonly<{ viewer: Viewer }>) {
  const router = useRouter();
  const signOut = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', redirect: 'manual' });
    await router.invalidate();
  };
  return (
    <Row gap={8} align="center">
      <Avatar name={viewer.name ?? viewer.login} src={viewer.avatarUrl} size={28} circle />
      <IconButton
        variant="ghost"
        diameter={32}
        glyph={18}
        icon="logout"
        label="Sign out"
        onPress={() => void signOut()}
      />
    </Row>
  );
}

/** Lingua's header: the shared site chrome, with who is signed in or a way to sign in that comes back here. */
export function LinguaHeader({ viewer }: Readonly<{ viewer: Viewer | null }>) {
  const here = useLocation({ select: (location) => location.href });
  return (
    <SiteHeader
      title="Lingua"
      actions={
        viewer ? (
          <SignedIn viewer={viewer} />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            icon="brand-github"
            label="Sign in"
            href={signInUrl(here)}
            role="link"
          />
        )
      }
    />
  );
}
