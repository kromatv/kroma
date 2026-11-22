import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AccountPage } from '#web/features/accounts/account/account-page.component';
import { ACCOUNT_SECTIONS } from '#web/features/accounts/account/account-sections';

const Search = z.object({
  section: z.enum(ACCOUNT_SECTIONS).optional().catch(undefined),
  pin: z.enum(['set']).optional().catch(undefined),
});

export const Route = createFileRoute('/_app/account')({
  validateSearch: (raw: Record<string, unknown>) => Search.parse(raw),
  component: AccountRoute,
});

function AccountRoute() {
  const { section = 'profile', pin } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AccountPage
      section={section}
      pinAsked={pin === 'set'}
      onSection={(next) =>
        void navigate({ search: { section: next === 'profile' ? undefined : next }, replace: true })
      }
    />
  );
}
