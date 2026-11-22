import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { keptFromKids } from '#web/shared/lib/kids-routes';
import { useKidsSession } from '#web/shared/lib/use-kids-session.hook';

/** Sends a Kids session home from a page it never opens, typed or followed. */
export function useKidsRoutes(): void {
  const kids = useKidsSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  useEffect(() => {
    if (kids && keptFromKids(pathname)) {
      void navigate({ to: '/', replace: true });
    }
  }, [kids, pathname, navigate]);
}
