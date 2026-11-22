import { useAuth } from '#web/shared/lib/auth';

/** Whether the signed-in session wears the KROMA Kids experience (ACCT-136). */
export function useKidsSession(): boolean {
  const { user } = useAuth();
  return user?.kids === true;
}
