// The bookmarkable sign-in entry, for when someone must be sent to sign in and
// back (`?redirect=<path>`). Elsewhere the `AuthGate` overlay gates in place.

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { LoginGate } from '#web/features/accounts/auth-gate';
import { useAuth } from '#web/shared/lib/auth';

// Only a single-leading-slash internal path, which guards against open
// redirects to another origin. A backslash counts as a slash to the URL parser
// (`/\evil.com` resolves to `https://evil.com/`), so the second character is
// rejected either way. /login itself is dropped: arriving there clears the
// fresh session, looping the sign-in forever.
function safeRedirect(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.startsWith('/')) return undefined;
  if (v[1] === '/' || v[1] === '\\') return undefined;
  return v.startsWith('/login') ? undefined : v;
}

export const Route = createFileRoute('/login')({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirect(s.redirect),
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const { user, ready, switchProfile } = useAuth();
  const navigate = useNavigate();
  const didInit = useRef(false);
  // Set once the session is cleared, so being already signed in on arrival never
  // triggers an immediate bounce.
  const [armed, setArmed] = useState(false);

  // Entering /login behaves like "change profile": drop the session so the
  // picker shows, rather than bouncing a signed-in visitor straight back out.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    switchProfile();
  }, [switchProfile]);

  useEffect(() => {
    if (!ready) return;
    if (!armed) {
      if (!user) setArmed(true);
      return;
    }
    if (user) navigate({ to: redirect ?? '/', replace: true });
  }, [armed, ready, user, redirect, navigate]);

  return <LoginGate />;
}
