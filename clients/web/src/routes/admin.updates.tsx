import { createFileRoute } from '@tanstack/react-router';
import { ServerUpdatesPage } from '#web/features/admin/server-updates';

export const Route = createFileRoute('/admin/updates')({ component: ServerUpdatesPage });
