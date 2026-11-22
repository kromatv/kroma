import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/trending/')({
  beforeLoad: () => {
    throw redirect({ to: '/trending/$type', params: { type: 'movie' }, replace: true });
  },
});
