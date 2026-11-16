import { SiteDocument, siteHead } from '@kromatv/site-kit/site-document';
import appCss from '@kromatv/ui/css?url';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { EmptyState } from '@kromatv/ui/kit/molecules/empty-state';
import { createRootRoute, type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { LinguaPage } from '#site/components/lingua-page.component';
import { RouteLink } from '#site/components/route-link.component';
import { getSite } from '#site/lib/loaders';

function GoHome({ variant }: Readonly<{ variant?: 'primary' | 'ghost' }>) {
  return (
    <Button variant={variant} icon="home" label="Go home" asChild>
      <RouteLink to="/" />
    </Button>
  );
}

function NotFound() {
  return (
    <LinguaPage viewer={null}>
      <EmptyState.Root icon="error-404">
        <EmptyState.Title>Page not found</EmptyState.Title>
        <EmptyState.Hint>Lingua has no page at this address.</EmptyState.Hint>
        <EmptyState.Actions>
          <GoHome />
        </EmptyState.Actions>
      </EmptyState.Root>
    </LinguaPage>
  );
}

function Failed({ reset }: Readonly<ErrorComponentProps>) {
  const router = useRouter();
  const retry = async () => {
    reset();
    await router.invalidate();
  };
  return (
    <LinguaPage viewer={null}>
      <EmptyState.Root icon="alert-triangle">
        <EmptyState.Title>This page could not load</EmptyState.Title>
        <EmptyState.Hint>Something went wrong on the way. Try again in a moment.</EmptyState.Hint>
        <EmptyState.Actions>
          <Button icon="refresh" label="Try again" onPress={() => void retry()} />
          <GoHome variant="ghost" />
        </EmptyState.Actions>
      </EmptyState.Root>
    </LinguaPage>
  );
}

export const Route = createRootRoute({
  head: () =>
    siteHead({
      appCss,
      title: 'Lingua',
      description:
        'Translate a project in the browser: sign in with GitHub, fix or add a language, and your edits reach the repository as a pull request.',
    }),
  loader: () => getSite(),
  staleTime: Number.POSITIVE_INFINITY,
  shellComponent: SiteDocument,
  notFoundComponent: NotFound,
  errorComponent: Failed,
});
