import { Button } from '@kromatv/ui/kit/atoms/button';
import { Callout } from '@kromatv/ui/kit/molecules/callout';
import { useLocation } from '@tanstack/react-router';
import { signInUrl } from '#site/lib/api-client';

/** Asks a signed-out visitor to sign in with GitHub before editing, and brings them back to this page. */
export function SignInPrompt() {
  const here = useLocation({ select: (location) => location.href });
  return (
    <Callout.Root tone="accent" size="sm" icon="lock">
      <Callout.Title>Sign in with GitHub to edit</Callout.Title>
      <Callout.Detail>Your edits reach the repository as a pull request.</Callout.Detail>
      <Callout.Actions>
        <Button
          size="sm"
          icon="brand-github"
          label="Sign in with GitHub"
          href={signInUrl(here)}
          role="link"
        />
      </Callout.Actions>
    </Callout.Root>
  );
}
