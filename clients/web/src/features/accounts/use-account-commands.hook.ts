import { useT } from '@kromatv/ui';
import { useRouterState } from '@tanstack/react-router';
import { useAuth } from '#web/shared/lib/auth';
import { useCommands } from '#web/shared/lib/command-menu';
import { useKidsSession } from '#web/shared/lib/use-kids-session.hook';

/** The viewer's own account, in the command menu. */
export function useAccountCommands(): void {
  const t = useT();
  const { logout } = useAuth();
  const kids = useKidsSession();
  const href = useRouterState({ select: ({ location }) => location.href });

  useCommands(
    [
      !kids && {
        label: t('nav.accountSettings'),
        icon: 'user-circle',
        keywords: 'profile profil password mot de passe language langue',
        to: '/account',
      },
      { label: t('nav.changeProfile'), icon: 'users', to: '/login', search: { redirect: href } },
      !kids && {
        label: t('auth.logout'),
        icon: 'logout',
        keywords: 'sign out deconnexion',
        run: logout,
      },
    ],
    { group: t('nav.account') },
  );
}
