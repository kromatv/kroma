import { takeKidsProfileAsk } from '@kromatv/core';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useSession } from '#mobile/lib/session';

/** Opens the Kids profile form once the admin who asked for it from the gate
 *  is in (ACCT-135). */
export function useAskedKidsForm(): void {
  const { user } = useSession();
  const router = useRouter();
  const userId = user?.id;
  useEffect(() => {
    if (userId && takeKidsProfileAsk(userId)) {
      router.push('/(app)/add-kids');
    }
  }, [userId, router]);
}
