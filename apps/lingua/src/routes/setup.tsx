import { Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { Callout } from '@kromatv/ui/kit/molecules/callout';
import { PageHeader } from '@kromatv/ui/kit/molecules/page-header';
import { createFileRoute } from '@tanstack/react-router';
import { CopyValue } from '#site/components/copy-value.component';
import { LinguaPage } from '#site/components/lingua-page.component';
import { OutsideLink } from '#site/components/outside-link.component';
import { RepositoryRow } from '#site/components/repository-row.component';
import { RouteLink } from '#site/components/route-link.component';
import { SetupStep } from '#site/components/setup-step.component';
import { counted } from '#site/lib/counted';
import { getSetup } from '#site/lib/loaders';
import { repositoriesState } from '#site/lib/sync-facts';
import { usePollWhileReading } from '#site/lib/use-poll-while-reading.hook';
import type { SetupView } from '#site/lib/views';

export const Route = createFileRoute('/setup')({
  loader: () => getSetup(),
  component: SetupPage,
});

function AllDone({ repositories }: Readonly<{ repositories: number }>) {
  return (
    <Callout.Root tone="success" icon="circle-check">
      <Callout.Title>Lingua is set up</Callout.Title>
      <Callout.Detail>
        {`People can sign in, and Lingua translates ${counted(repositories, 'project')}.`}
      </Callout.Detail>
      <Callout.Actions>
        <Button size="sm" icon="folders" label="Go to projects" asChild>
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
        <Button variant="outline" icon="brand-github" label="New OAuth App" asChild>
          <OutsideLink to="https://github.com/settings/applications/new" />
        </Button>
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
      title="Sign-in"
      purpose="A GitHub OAuth App signs contributors in, and each send opens their pull request from their own fork, under their name. Its client id and secret also authenticate every read of a repository."
      state={view.signIn ? 'done' : 'todo'}
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
      state={repositoriesState(view.repositories.map((repository) => repository.sync))}
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
  const syncs = view.repositories.map((repository) => repository.sync);
  usePollWhileReading(syncs);
  return (
    <LinguaPage>
      <PageHeader.Root>
        <PageHeader.Title>Status</PageHeader.Title>
        <PageHeader.Subtitle>
          Where each repository’s sync stands, and how people sign in to this Lingua.
        </PageHeader.Subtitle>
      </PageHeader.Root>
      {view.signIn && repositoriesState(syncs) === 'done' ? (
        <AllDone repositories={view.repositories.length} />
      ) : null}
      <Column gap={16}>
        <RepositoriesStep view={view} />
        <SignInStep view={view} />
      </Column>
    </LinguaPage>
  );
}
