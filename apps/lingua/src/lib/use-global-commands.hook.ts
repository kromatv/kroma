import { useLocation, useRouter } from '@tanstack/react-router';
import { signInUrl } from '#site/lib/api-client';
import { accountCommands, setupCommand, themeCommands } from '#site/lib/command-actions';
import type { LinguaCommand } from '#site/lib/command-registry';
import { profileUrl } from '#site/lib/github-links';
import { useSignOut } from '#site/lib/use-sign-out.hook';
import { useThemeMode } from '#site/lib/use-theme-mode.hook';
import type { Viewer } from '#site/lib/views';

/** The command menu's rows that every page has: Lingua's own pages, the account, and the theme. */
export function useGlobalCommands(viewer: Viewer | null): LinguaCommand[] {
  const router = useRouter();
  const signOut = useSignOut();
  const here = useLocation({ select: (location) => location.href });
  const theme = useThemeMode();
  const account = accountCommands(viewer, {
    contributions: () => router.navigate({ to: '/contributions' }),
    profile: () => {
      window.open(profileUrl(viewer?.login ?? ''), '_blank', 'noopener,noreferrer');
    },
    signOut,
    signIn: () => window.location.assign(signInUrl(here)),
  });
  return [
    setupCommand(() => router.navigate({ to: '/setup' })),
    ...account,
    ...themeCommands(theme.mode, theme.choose),
  ];
}
