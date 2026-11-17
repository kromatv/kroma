import { Button } from '@kromatv/ui/kit/atoms/button';
import type { IconName } from '@kromatv/ui/kit/atoms/icon';
import { EmptyState } from '@kromatv/ui/kit/molecules/empty-state';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { LinguaPage } from '#site/components/lingua-page.component';
import { RouteLink } from '#site/components/route-link.component';
import { signInUrl } from '#site/lib/api-client';
import { titled } from '#site/lib/page-title';
import { Problem } from '#site/lib/problem';

type Way = 'sign-in' | 'setup' | 'home';

interface Explained {
  icon: IconName;
  title: string;
  hint: string;
  ways: [Way, ...Way[]];
}

const EXPLAINED: Record<Problem, Explained> = {
  'sign-in-unavailable': {
    icon: 'lock',
    title: 'Sign-in is not set up yet',
    hint: 'This Lingua has no GitHub OAuth App to sign people in with. Whoever runs it adds one on the setup page.',
    ways: ['setup', 'home'],
  },
  'sign-in-expired': {
    icon: 'clock',
    title: 'This sign-in link expired',
    hint: 'A sign-in has ten minutes to come back from GitHub, in the browser that started it. Start again.',
    ways: ['sign-in', 'home'],
  },
  'sign-in-refused': {
    icon: 'brand-github',
    title: 'GitHub did not confirm the sign-in',
    hint: 'It was cancelled on GitHub, or GitHub refused it. Try again.',
    ways: ['sign-in', 'home'],
  },
};

const UNKNOWN: Explained = {
  icon: 'alert-triangle',
  title: 'Something went wrong',
  hint: 'Lingua could not finish what you asked. Start again from the home page.',
  ways: ['home'],
};

const ROUTED = {
  setup: { to: '/setup', icon: 'settings', label: 'Open setup' },
  home: { to: '/', icon: 'home', label: 'Go home' },
} as const;

export const Route = createFileRoute('/problem')({
  validateSearch: z.object({ reason: Problem.optional().catch(undefined) }),
  head: () => titled('Sign-in'),
  component: ProblemPage,
});

function WayForward({ way, primary }: Readonly<{ way: Way; primary: boolean }>) {
  const variant = primary ? 'primary' : 'ghost';
  if (way === 'sign-in') {
    return (
      <Button
        variant={variant}
        icon="brand-github"
        label="Sign in again"
        href={signInUrl('/')}
        role="link"
      />
    );
  }
  const { to, icon, label } = ROUTED[way];
  return (
    <Button variant={variant} icon={icon} label={label} asChild>
      <RouteLink to={to} />
    </Button>
  );
}

function ProblemPage() {
  const { reason } = Route.useSearch();
  const { icon, title, hint, ways } = reason ? EXPLAINED[reason] : UNKNOWN;
  return (
    <LinguaPage>
      <EmptyState.Root icon={icon}>
        <EmptyState.Title>{title}</EmptyState.Title>
        <EmptyState.Hint>{hint}</EmptyState.Hint>
        <EmptyState.Actions>
          {ways.map((way, at) => (
            <WayForward key={way} way={way} primary={at === 0} />
          ))}
        </EmptyState.Actions>
      </EmptyState.Root>
    </LinguaPage>
  );
}
