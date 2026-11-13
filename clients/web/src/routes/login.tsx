// The bookmarkable sign-in entry, for when someone must be sent to sign in and
// back (`?redirect=<path>`). Elsewhere the `AuthGate` overlay gates in place.

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { LoginGate } from '#web/features/accounts/auth-gate';
import { useAuth } from '#web/shared/lib/auth';
import { safeRedirect } from '#web/shared/lib/safe-redirect';

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
  if (ready && !armed && !user) setArmed(true);

  // Entering /login behaves like "change profile": drop the session so the
  // picker shows, rather than bouncing a signed-in visitor straight back out.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    switchProfile();
  }, [switchProfile]);

  useEffect(() => {
    if (!ready || !armed) return;
    if (user) navigate({ to: redirect ?? '/', replace: true });
  }, [armed, ready, user, redirect, navigate]);

  return <LoginGate />;
}
