import { useRouter } from '@tanstack/react-router';

/** Ends the session, then reloads the page's data as a visitor sees it. */
export function useSignOut(): () => Promise<void> {
  const router = useRouter();
  return async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', redirect: 'manual' });
    await router.invalidate();
  };
}
