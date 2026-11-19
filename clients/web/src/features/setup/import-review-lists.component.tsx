import type { ImportLibrary, ImportUser } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { Box, ChoiceList, Text } from '@kromatv/ui/kit';
import {
  cautions,
  importable,
  keptIds,
  sight,
  skippedIds,
} from '#web/features/setup/import-review';
import { useImportSession } from '#web/features/setup/import-session.component';
import { KIND_NAME } from '#web/features/setup/import-words';
import { shortPath } from '#web/features/setup/media-step.component';

const SIGHT_LINE = {
  all: 'setup.importUserAll',
  none: 'setup.importUserNone',
} as const;

const CAUTION_LINE = {
  you: 'setup.importUserYou',
  limited: 'setup.importUserLimited',
  locked: 'setup.importUserLocked',
} as const;

function Heading({ children }: Readonly<{ children: string }>) {
  return (
    <Text variant="overline" color="textDim">
      {children}
    </Text>
  );
}

function LibraryChoice({ library }: Readonly<{ library: ImportLibrary }>) {
  const t = useT();
  const folders = library.folders.map(shortPath).join(', ');
  return (
    <ChoiceList.Item value={library.id} disabled={!importable(library)}>
      <ChoiceList.Label>{library.name}</ChoiceList.Label>
      <ChoiceList.Hint>
        {folders ? `${t(KIND_NAME[library.kind])} · ${folders}` : t(KIND_NAME[library.kind])}
      </ChoiceList.Hint>
    </ChoiceList.Item>
  );
}

/** The libraries of the other server, each one selected until the owner
 * leaves it out. A library of a kind KROMA does not play cannot be selected. */
export function ReviewLibraries({ libraries }: Readonly<{ libraries: readonly ImportLibrary[] }>) {
  const t = useT();
  const { session, update } = useImportSession();
  const ids = libraries.filter(importable).map((library) => library.id);
  return (
    <Box gap={8}>
      <Heading>{t('setup.importLibraries')}</Heading>
      <ChoiceList.Root
        mode="multiple"
        size="md"
        label={t('setup.importLibraries')}
        value={keptIds(ids, session.skippedLibraries)}
        onValueChange={(kept) => update({ skippedLibraries: skippedIds(ids, kept) })}
      >
        {libraries.map((library) => (
          <LibraryChoice key={library.id} library={library} />
        ))}
      </ChoiceList.Root>
    </Box>
  );
}

function useUserLine(user: ImportUser): string {
  const t = useT();
  const seen = sight(user);
  const sees =
    seen === 'some'
      ? t('setup.importUserSome', { count: user.libraries.length })
      : t(SIGHT_LINE[seen]);
  return [sees, ...cautions(user).map((note) => t(CAUTION_LINE[note]))].join(' · ');
}

function UserChoice({ user }: Readonly<{ user: ImportUser }>) {
  const line = useUserLine(user);
  return (
    <ChoiceList.Item value={user.id}>
      <ChoiceList.Label>{user.email ? `${user.name} · ${user.email}` : user.name}</ChoiceList.Label>
      <ChoiceList.Hint>{line}</ChoiceList.Hint>
    </ChoiceList.Item>
  );
}

/** The users of the other server, each one selected until the owner leaves
 * them out, with what the owner must know about each. */
export function ReviewUsers({ users }: Readonly<{ users: readonly ImportUser[] }>) {
  const t = useT();
  const { session, update } = useImportSession();
  const ids = users.map((user) => user.id);
  return (
    <Box gap={8}>
      <Heading>{t('setup.importUsers')}</Heading>
      <ChoiceList.Root
        mode="multiple"
        size="md"
        label={t('setup.importUsers')}
        value={keptIds(ids, session.skippedUsers)}
        onValueChange={(kept) => update({ skippedUsers: skippedIds(ids, kept) })}
      >
        {users.map((user) => (
          <UserChoice key={user.id} user={user} />
        ))}
      </ChoiceList.Root>
    </Box>
  );
}
