import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { keptFromKids } from '#mobile/lib/kids-routes';
import { useSession } from '#mobile/lib/session';

/** Sends a Kids session back to the tabs from a screen it never opens, however
 *  it got there. */
export function useKidsRoutes(): void {
  const { user } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const kept = user?.kids === true && keptFromKids(pathname);
  useEffect(() => {
    if (kept) {
      router.replace('/(app)/(tabs)');
    }
  }, [kept, router]);
}
