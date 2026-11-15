import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ACCOUNT_SECTIONS, AccountPage } from '#web/features/accounts/account/account-page';

const Search = z.object({ section: z.enum(ACCOUNT_SECTIONS).optional().catch(undefined) });

export const Route = createFileRoute('/_app/account')({
  validateSearch: (raw: Record<string, unknown>) => Search.parse(raw),
  component: AccountRoute,
});

function AccountRoute() {
  const { section = 'profile' } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AccountPage
      section={section}
      onSection={(next) =>
        void navigate({ search: { section: next === 'profile' ? undefined : next }, replace: true })
      }
    />
  );
}
