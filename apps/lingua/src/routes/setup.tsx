import { Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { Callout } from '@kromatv/ui/kit/molecules/callout';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { CopyValue } from '#site/components/copy-value.component';
import { CreateAppForm } from '#site/components/create-app-form.component';
import { LinguaPage } from '#site/components/lingua-page.component';
import { RouteLink } from '#site/components/route-link.component';
import { SetupStep } from '#site/components/setup-step.component';
import { counted } from '#site/lib/counted';
import { getSetup } from '#site/lib/loaders';
import type { SetupView } from '#site/lib/views';

const SetupSearch = z.object({
  created: z.literal(1).optional().catch(undefined),
  code: z.string().max(64).optional().catch(undefined),
});

export const Route = createFileRoute('/setup')({
  validateSearch: SetupSearch,
  loaderDeps: ({ search }) => ({ code: search.created ? (search.code ?? null) : null }),
  loader: ({ deps }) => getSetup({ data: { code: deps.code } }),
  component: SetupPage,
});

const translated = (view: SetupView) => view.app && view.repositories > 0;

function AllDone({ repositories }: Readonly<{ repositories: number }>) {
  return (
    <Callout.Root tone="success" icon="circle-check">
      <Callout.Title>Lingua is set up</Callout.Title>
      <Callout.Detail>
        {`Both apps are connected, and Lingua translates ${counted(repositories, 'project')}.`}
      </Callout.Detail>
      <Callout.Actions>
        <Button size="sm" icon="home" label="Go home" asChild>
          <RouteLink to="/" />
        </Button>
      </Callout.Actions>
    </Callout.Root>
  );
}

function AlmostThere({ code }: Readonly<{ code: string }>) {
  return (
    <Callout.Root tone="accent" icon="hourglass">
      <Callout.Title>Almost there</Callout.Title>
      <Callout.Detail>
        GitHub created the App. Store its secrets in this Worker within the hour, one of two ways.
      </Callout.Detail>
      <Column gap={10} mt={8}>
        <Text>
          From the deploy pipeline: run the <Text variant="label">Lingua</Text> workflow with{' '}
          <Text variant="label">connect</Text> ticked. This deployment kept the code for it.
        </Text>
        <Text>From a checkout where wrangler is signed in:</Text>
        <CopyValue label="Command" value={`bun run --filter @kromatv/lingua setup ${code}`} />
      </Column>
    </Callout.Root>
  );
}

function AppStep({ view }: Readonly<{ view: SetupView }>) {
  return (
    <SetupStep
      title="1. GitHub App"
      purpose="It keeps the repositories in sync and receives their webhooks. GitHub fills in every permission and address, then sends you back here."
      done={view.app}
    >
      {view.app ? null : (
        <CreateAppForm manifest={view.manifest} owners={view.owners} signIn={view.signIn} />
      )}
    </SetupStep>
  );
}

function OAuthValues({ origin }: Readonly<{ origin: string }>) {
  return (
    <Column gap={12}>
      <Text>Create it by hand, under your account or an organisation, with these values:</Text>
      <CopyValue label="Application name" value={`Lingua ${new URL(origin).host}`.slice(0, 34)} />
      <CopyValue label="Homepage URL" value={origin} />
      <CopyValue label="Authorization callback URL" value={`${origin}/auth/callback`} />
      <Row>
        <Button
          variant="outline"
          icon="brand-github"
          label="New OAuth App"
          href="https://github.com/settings/applications/new"
          role="link"
        />
      </Row>
      <Text color="textMuted">
        Generate a client secret, then store the client id and the secret as this Worker’s secrets{' '}
        <Text font="mono">GITHUB_OAUTH_CLIENT_ID</Text> and{' '}
        <Text font="mono">GITHUB_OAUTH_CLIENT_SECRET</Text>.
      </Text>
    </Column>
  );
}

function SignInStep({ view }: Readonly<{ view: SetupView }>) {
  return (
    <SetupStep
      title="2. Sign-in (GitHub OAuth App)"
      purpose="Contributors sign in through it, and it opens each one’s pull request from their own fork, under their name."
      done={view.signIn}
    >
      {view.signIn ? null : <OAuthValues origin={view.origin} />}
    </SetupStep>
  );
}

function InstallStep({ view }: Readonly<{ view: SetupView }>) {
  const done = translated(view);
  return (
    <SetupStep
      title="3. Install the App"
      purpose="On each repository to translate. Each needs a lingua.json at its root; the next push or the next ten-minute sync picks it up."
      done={done}
    >
      {view.installUrl ? (
        <Row gap={12} wrap align="center">
          <Button
            variant={done ? 'outline' : 'primary'}
            icon="brand-github"
            label={done ? 'Install on more repositories' : 'Install the GitHub App'}
            href={view.installUrl}
            role="link"
          />
          {done ? (
            <Text color="textMuted">{`Lingua translates ${counted(view.repositories, 'project')}.`}</Text>
          ) : null}
        </Row>
      ) : (
        <Text color="textDim">The install link appears here once the GitHub App exists.</Text>
      )}
    </SetupStep>
  );
}

function SetupPage() {
  const view = Route.useLoaderData();
  return (
    <LinguaPage viewer={view.viewer}>
      <Column gap={16} maxW={760}>
        <Column gap={10}>
          <Text variant="h1">Set up Lingua</Text>
          <Text color="textMuted">
            Lingua talks to GitHub through two apps: a GitHub App that keeps the repositories in
            sync, and an OAuth App people sign in with.
          </Text>
        </Column>
        {view.app && view.signIn && translated(view) ? (
          <AllDone repositories={view.repositories} />
        ) : null}
        {view.code ? <AlmostThere code={view.code} /> : null}
        <AppStep view={view} />
        <SignInStep view={view} />
        <InstallStep view={view} />
      </Column>
    </LinguaPage>
  );
}
