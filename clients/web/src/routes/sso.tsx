import { createFileRoute } from '@tanstack/react-router';
import { SsoReturn } from '#web/features/accounts/sso-return';

export const Route = createFileRoute('/sso')({
  validateSearch: (s: Record<string, unknown>): { flow?: string; code?: string } => ({
    flow: typeof s.flow === 'string' ? s.flow : undefined,
    code: typeof s.code === 'string' ? s.code : undefined,
  }),
  component: SsoPage,
});

function SsoPage() {
  const { flow, code } = Route.useSearch();
  return <SsoReturn flow={flow} code={code} />;
}
