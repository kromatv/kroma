import { createFileRoute } from '@tanstack/react-router';
import { AiPage } from '#web/features/admin/ai.component';

export const Route = createFileRoute('/admin/ai')({
  component: AiPage,
});
