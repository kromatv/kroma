import { useKidsLook } from '@kromatv/ui/kit';
import { useAuth } from '#web/shared/lib/auth';

/** Dresses the app in the Kids theme while a Kids session is signed in, and in
 *  KROMA's again once it leaves (ACCT-136). Draws nothing. */
export function KidsLook(): null {
  useKidsLook(useAuth().user);
  return null;
}
