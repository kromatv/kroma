import { createFileRoute } from '@tanstack/react-router';
import { InvitePage } from '#web/features/accounts/invite.component';

export const Route = createFileRoute('/_app/invite')({
  component: InvitePage,
});
