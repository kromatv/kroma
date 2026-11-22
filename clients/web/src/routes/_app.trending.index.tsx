import { createFileRoute } from '@tanstack/react-router';
import { openTrendingFilms } from '#web/features/requests/trending-url';

export const Route = createFileRoute('/_app/trending/')({
  beforeLoad: openTrendingFilms,
});
