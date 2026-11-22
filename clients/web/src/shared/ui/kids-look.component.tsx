import { KROMA, KROMA_KIDS, KROMA_KIDS_LIGHT, useThemeControls } from '@kromatv/ui/kit';
import { useEffect } from 'react';
import { useKidsSession } from '#web/shared/lib/use-kids-session.hook';

/** Paints the app in the Kids theme while a Kids session is signed in, and in
 *  KROMA's again once it leaves (ACCT-136). Draws nothing. */
export function KidsLook(): null {
  const kids = useKidsSession();
  const theme = useThemeControls();
  useEffect(() => {
    if (!kids) {
      return undefined;
    }
    theme.applyTheme(KROMA_KIDS, KROMA_KIDS_LIGHT);
    return () => theme.applyTheme(KROMA);
  }, [kids, theme]);
  return null;
}
