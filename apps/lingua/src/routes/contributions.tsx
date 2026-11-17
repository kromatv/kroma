import { Badge } from '@kromatv/ui/kit/atoms/badge';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { EmptyState } from '@kromatv/ui/kit/molecules/empty-state';
import { ListRow } from '@kromatv/ui/kit/molecules/list-row';
import { PageHeader } from '@kromatv/ui/kit/molecules/page-header';
import { createFileRoute, useLocation } from '@tanstack/react-router';
import { LinguaPage } from '#site/components/lingua-page.component';
import { OutsideLink } from '#site/components/outside-link.component';
import { RouteLink } from '#site/components/route-link.component';
import { signInUrl } from '#site/lib/api-client';
import { counted } from '#site/lib/counted';
import { getContributions } from '#site/lib/loaders';
import { projectParams } from '#site/lib/project-id';
import { useDiscard } from '#site/lib/use-discard.hook';
import type { Contribution } from '#site/lib/views';

export const Route = createFileRoute('/contributions')({
  loader: () => getContributions(),
  component: ContributionsPage,
});

function pending({ drafts, proposed }: Contribution): string {
  const parts = [
    drafts > 0 ? `${counted(drafts, 'change')} not sent` : null,
    proposed > 0 ? `${counted(proposed, 'change')} waiting for review` : null,
  ];
  return parts.filter((part) => part !== null).join(' · ') || 'Nothing waiting';
}

function Files({ contribution }: Readonly<{ contribution: Contribution }>) {
  const params = { ...projectParams(contribution.project), locale: contribution.language.tag };
  if (contribution.files.length === 0) {
    return null;
  }
  return (
    <ListRow.Group size="sm">
      {contribution.files.map(({ file, drafts }) => (
        <ListRow.Root key={file} icon="file-text" label={file} asChild>
          <RouteLink to="/$owner/$repo/$locale/$" params={{ ...params, _splat: file }}>
            <ListRow.Label>{file}</ListRow.Label>
            <ListRow.Trailing>
              <Box>
                <Badge tone="info">{`${drafts} not sent`}</Badge>
              </Box>
            </ListRow.Trailing>
          </RouteLink>
        </ListRow.Root>
      ))}
    </ListRow.Group>
  );
}

function DiscardButton({ contribution }: Readonly<{ contribution: Contribution }>) {
  const { project, language, drafts, started, proposal } = contribution;
  const discarding = useDiscard({
    project,
    locale: language.tag,
    language: language.name,
    drafts,
    started,
    proposal,
  });
  return (
    <Button
      variant="ghost"
      size="sm"
      icon="trash"
      label="Discard"
      loading={discarding.busy}
      onPress={() => void discarding.discard()}
    />
  );
}

function Actions({ contribution }: Readonly<{ contribution: Contribution }>) {
  const { proposal } = contribution;
  const params = { ...projectParams(contribution.project), locale: contribution.language.tag };
  return (
    <Row gap={8} wrap>
      {contribution.drafts > 0 ? <DiscardButton contribution={contribution} /> : null}
      {proposal ? (
        <Button
          variant="ghost"
          size="sm"
          icon="git-pull-request"
          label={`Pull request #${proposal.number}`}
          asChild
        >
          <OutsideLink to={proposal.url} />
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="glass"
        iconRight="chevron-right"
        label={contribution.drafts > 0 ? 'Review and send' : 'Open'}
        asChild
      >
        <RouteLink to="/$owner/$repo/$locale" params={params} />
      </Button>
    </Row>
  );
}

function Card({ contribution }: Readonly<{ contribution: Contribution }>) {
  return (
    <Box bg="surface1" border="border" radius="xl" p={16} gap={12}>
      <Row gap={12} wrap between align="center">
        <Column gap={2} shrink={1} minW={0}>
          <Text variant="title">{`${contribution.language.name} · ${contribution.project}`}</Text>
          <Text variant="meta" color="textDim">
            {pending(contribution)}
          </Text>
        </Column>
        <Actions contribution={contribution} />
      </Row>
      <Files contribution={contribution} />
    </Box>
  );
}

function SignedOut() {
  const here = useLocation({ select: (location) => location.href });
  return (
    <EmptyState.Root icon="lock">
      <EmptyState.Title>Sign in to see your contributions</EmptyState.Title>
      <EmptyState.Hint>
        Your unsent changes and open pull requests, in every project and language.
      </EmptyState.Hint>
      <EmptyState.Actions>
        <Button
          icon="brand-github"
          label="Sign in with GitHub"
          href={signInUrl(here)}
          role="link"
        />
      </EmptyState.Actions>
    </EmptyState.Root>
  );
}

function Nothing() {
  return (
    <EmptyState.Root icon="git-pull-request">
      <EmptyState.Title>Nothing waiting</EmptyState.Title>
      <EmptyState.Hint>
        Translate a few messages and they show here until a maintainer merges them.
      </EmptyState.Hint>
      <EmptyState.Actions>
        <Button icon="folders" label="Pick a project" asChild>
          <RouteLink to="/" />
        </Button>
      </EmptyState.Actions>
    </EmptyState.Root>
  );
}

function ContributionsPage() {
  const { viewer, contributions } = Route.useLoaderData();
  return (
    <LinguaPage>
      <PageHeader.Root>
        <PageHeader.Title>My contributions</PageHeader.Title>
        <PageHeader.Subtitle>
          Your unsent changes and open pull requests, language by language.
        </PageHeader.Subtitle>
      </PageHeader.Root>
      {viewer === null ? <SignedOut /> : null}
      {viewer !== null && contributions.length === 0 ? <Nothing /> : null}
      <Column gap={12}>
        {contributions.map((contribution) => (
          <Card
            key={`${contribution.project}/${contribution.language.tag}`}
            contribution={contribution}
          />
        ))}
      </Column>
    </LinguaPage>
  );
}
