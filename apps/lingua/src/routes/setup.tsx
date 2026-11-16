import { Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { Callout } from '@kromatv/ui/kit/molecules/callout';
import { createFileRoute } from '@tanstack/react-router';
import { CopyValue } from '#site/components/copy-value.component';
import { LinguaPage } from '#site/components/lingua-page.component';
import { RepositoryRow } from '#site/components/repository-row.component';
import { RouteLink } from '#site/components/route-link.component';
import { SetupStep } from '#site/components/setup-step.component';
import { counted } from '#site/lib/counted';
import { getSetup } from '#site/lib/loaders';
import type { SetupView } from '#site/lib/views';

export const Route = createFileRoute('/setup')({
  loader: () => getSetup(),
  component: SetupPage,
});

const translating = (view: SetupView) =>
  view.repositories.length > 0 && view.repositories.every((r) => r.sync.kind === 'current');

function AllDone({ repositories }: Readonly<{ repositories: number }>) {
  return (
    <Callout.Root tone="success" icon="circle-check">
      <Callout.Title>Lingua is set up</Callout.Title>
      <Callout.Detail>
        {`People can sign in, and Lingua translates ${counted(repositories, 'project')}.`}
      </Callout.Detail>
      <Callout.Actions>
        <Button size="sm" icon="home" label="Go home" asChild>
          <RouteLink to="/" />
        </Button>
      </Callout.Actions>
    </Callout.Root>
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
      title="Sign-in (GitHub OAuth App)"
      purpose="Contributors sign in through it, and each send opens their pull request from their own fork, under their name. Its client id and secret also authenticate every read of a repository."
      done={view.signIn}
    >
      {view.signIn ? null : <OAuthValues origin={view.origin} />}
    </SetupStep>
  );
}

function AddRepository() {
  return (
    <Column gap={8}>
      <Text>
        To add one, list it in the Worker variable <Text font="mono">LINGUA_PROJECTS</Text> and
        commit a <Text font="mono">lingua.json</Text> at its root.
      </Text>
      <CopyValue label="LINGUA_PROJECTS" value="owner/repo, owner/other@branch" />
      <Text color="textMuted">
        Entries are comma separated: <Text font="mono">owner/repo</Text> tracks the default branch,{' '}
        <Text font="mono">owner/repo@branch</Text> another one. The repository must be public. The
        next sync, within five minutes, picks it up.
      </Text>
    </Column>
  );
}

function RepositoriesStep({ view }: Readonly<{ view: SetupView }>) {
  return (
    <SetupStep
      title="Repositories"
      purpose="The public repositories Lingua translates. It reads each one every five minutes, and when one of its pages opens."
      done={translating(view)}
    >
      {view.repositories.map((repository) => (
        <RepositoryRow key={repository.id} repository={repository} canSync={view.viewer !== null} />
      ))}
      <AddRepository />
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
            Lingua signs contributors in through a GitHub OAuth App, and reads the public
            repositories it is told to translate.
          </Text>
        </Column>
        {view.signIn && translating(view) ? (
          <AllDone repositories={view.repositories.length} />
        ) : null}
        <SignInStep view={view} />
        <RepositoriesStep view={view} />
      </Column>
    </LinguaPage>
  );
}
