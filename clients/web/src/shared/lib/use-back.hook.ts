import { useRouter } from '@tanstack/react-router';
import type { RoutePath } from '#web/shared/ui/route-link.component';

/** Back to the page before this one, the way the browser goes back, or to
 *  `fallback` in place of this page when it was opened directly. */
export function useBack(fallback: RoutePath): () => void {
  const router = useRouter();
  return () => {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }
    void router.navigate({ to: fallback, replace: true });
  };
}
