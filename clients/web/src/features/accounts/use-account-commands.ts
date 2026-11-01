import { useT } from '@kromatv/ui';
import { useRouterState } from '@tanstack/react-router';
import { useAuth } from '#web/shared/lib/auth';
import { useCommands } from '#web/shared/lib/command-menu';

/** The viewer's own account, in the command menu. */
export function useAccountCommands(): void {
  const t = useT();
  const { logout } = useAuth();
  const href = useRouterState({ select: ({ location }) => location.href });
  const group = t('nav.account');

  useCommands([
    {
      label: t('nav.accountSettings'),
      group,
      icon: 'user-circle',
      keywords: 'profile profil password mot de passe language langue',
      to: '/account',
    },
    {
      label: t('nav.changeProfile'),
      group,
      icon: 'users',
      to: '/login',
      search: { redirect: href },
    },
    {
      label: t('auth.logout'),
      group,
      icon: 'logout',
      keywords: 'sign out deconnexion',
      run: logout,
    },
  ]);
}
