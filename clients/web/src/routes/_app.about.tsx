import { createFileRoute } from '@tanstack/react-router';
import { AboutPage } from '#web/features/about/about-page.component';

export const Route = createFileRoute('/_app/about')({
  component: AboutPage,
});
