import { useEffect } from 'react';
import { KROMA } from './theme-create';
import { KROMA_KIDS, KROMA_KIDS_LIGHT } from './theme-kids';
import { useThemeControls } from './use-theme.hook';

/** Dresses this styling root in the Kids theme while the signed-in session
 *  wears the Kids experience, and gives it KROMA's back once it no longer
 *  does (ACCT-136). For an app on KROMA's own theme; one with a form factor of
 *  its own picks `kidsTheme` of its theme instead. */
export function useKidsLook(session: Readonly<{ kids?: boolean }> | null | undefined): void {
  const kids = session?.kids === true;
  const theme = useThemeControls();
  useEffect(() => {
    if (!kids) {
      return undefined;
    }
    theme.applyTheme(KROMA_KIDS, KROMA_KIDS_LIGHT);
    return () => theme.applyTheme(KROMA);
  }, [kids, theme]);
}
