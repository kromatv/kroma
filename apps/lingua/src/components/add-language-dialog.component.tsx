import { Box, Column } from '@kromatv/ui/kit/atoms/box';
import { Spinner } from '@kromatv/ui/kit/atoms/spinner';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { TextField } from '@kromatv/ui/kit/atoms/text-field';
import { Callout } from '@kromatv/ui/kit/molecules/callout';
import { ListRow } from '@kromatv/ui/kit/molecules/list-row';
import { Dialog } from '@kromatv/ui/kit/organisms/dialog';
import { useState } from 'react';
import { languageChoices } from '#site/lib/language';
import { type Starting, useStartLanguage } from '#site/lib/use-start-language.hook';
import type { Language } from '#site/lib/views';

const SHOWN = 60;

const WHO_SEES_IT =
  'Only you see it until you send your changes; your pull request then adds it as a draft.';

function Choices({
  choices,
  starting,
  onPick,
}: Readonly<{ choices: readonly Language[]; starting: Starting; onPick: (tag: string) => void }>) {
  return (
    <ListRow.Group size="sm">
      {choices.map((language) => (
        <ListRow.Root
          key={language.tag}
          label={`${language.name}, ${language.tag}`}
          disabled={starting.kind === 'starting'}
          onPress={() => onPick(language.tag)}
        >
          <ListRow.Label>{language.name}</ListRow.Label>
          <ListRow.Hint>{`${language.nativeName} · ${language.tag}`}</ListRow.Hint>
          {starting.kind === 'starting' && starting.tag === language.tag ? (
            <ListRow.Trailing>
              <Spinner size={16} />
            </ListRow.Trailing>
          ) : null}
        </ListRow.Root>
      ))}
    </ListRow.Group>
  );
}

function Refused({ starting }: Readonly<{ starting: Starting }>) {
  if (starting.kind !== 'failed') {
    return null;
  }
  return (
    <Callout.Root tone="danger" size="sm" icon="alert-triangle">
      <Callout.Title>The language did not start</Callout.Title>
      <Callout.Detail>{starting.message}</Callout.Detail>
    </Callout.Root>
  );
}

function NoMatch({ query }: Readonly<{ query: string }>) {
  return (
    <Box py={24} center>
      <Text color="textMuted">{`No language matches “${query.trim()}”. Type a tag, like de or pt-BR.`}</Text>
    </Box>
  );
}

function Finder({
  query,
  onQueryChange,
}: Readonly<{ query: string; onQueryChange: (next: string) => void }>) {
  return (
    <TextField
      type="search"
      icon="search"
      label="Find a language"
      placeholder="Name or tag, like German or pt-BR"
      value={query}
      onValueChange={onQueryChange}
      autoFocus
    />
  );
}

function Results({
  query,
  taken,
  project,
}: Readonly<{ query: string; taken: ReadonlySet<string>; project: string }>) {
  const { starting, start } = useStartLanguage(project);
  const choices = languageChoices(query, taken).slice(0, SHOWN);
  return (
    <Column gap={12}>
      <Refused starting={starting} />
      {choices.length === 0 ? (
        <NoMatch query={query} />
      ) : (
        <Choices choices={choices} starting={starting} onPick={(tag) => void start(tag)} />
      )}
    </Column>
  );
}

/** Starts translating `project` into a language it does not have yet, picked from a searchable list; `taken` are the tags it has. */
export function AddLanguageDialog({
  project,
  taken,
  onClose,
}: Readonly<{ project: string; taken: ReadonlySet<string>; onClose: () => void }>) {
  const [query, setQuery] = useState('');
  return (
    <Dialog.Root
      open
      onClose={onClose}
      title="Add a language"
      description={WHO_SEES_IT}
      width="sm"
      fullHeight
    >
      <Dialog.Header>
        <Finder query={query} onQueryChange={setQuery} />
      </Dialog.Header>
      <Dialog.Panel>
        <Results query={query} taken={taken} project={project} />
      </Dialog.Panel>
    </Dialog.Root>
  );
}
