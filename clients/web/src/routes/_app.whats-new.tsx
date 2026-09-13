import { createFileRoute } from '@tanstack/react-router';
import { WhatsNewPage } from '#web/features/releases/whats-new-page';

export const Route = createFileRoute('/_app/whats-new')({
  component: WhatsNewPage,
});
