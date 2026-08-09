import { createFileRoute } from '@tanstack/react-router';
import { InvitePage } from '#web/features/accounts/invite';

export const Route = createFileRoute('/_app/invite')({
  component: InvitePage,
});
