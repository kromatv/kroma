import type { ImportLibrary, ImportUser } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { Box, ChoiceList, Text } from '@kromatv/ui/kit';
import type { ComponentType } from 'react';
import {
  cautions,
  importable,
  keptIds,
  sight,
  skippedIds,
} from '#web/features/admin/import/import-review';
import {
  type ImportChoices,
  useImportSession,
} from '#web/features/admin/import/import-session.component';
import { KIND_NAME } from '#web/features/admin/import/import-words';
import { shortPath } from '#web/shared/lib/short-path';

const SIGHT_LINE = {
  all: 'setup.importUserAll',
  none: 'setup.importUserNone',
} as const;

const CAUTION_LINE = {
  you: 'setup.importUserYou',
  limited: 'setup.importUserLimited',
  locked: 'setup.importUserLocked',
} as const;

const KEPT_TITLE = {
  skippedLibraries: 'setup.importLibraries',
  skippedUsers: 'setup.importUsers',
} as const;

type SkippedField = keyof typeof KEPT_TITLE;

const EVERY = () => true;

function skippedPatch(field: SkippedField, skipped: string[]): Partial<ImportChoices> {
  return field === 'skippedLibraries' ? { skippedLibraries: skipped } : { skippedUsers: skipped };
}

interface KeptListProps<T extends { id: string }> {
  field: SkippedField;
  items: readonly T[];
  row: ComponentType<{ item: T }>;
  pickable?: (item: T) => boolean;
}

function KeptList<T extends { id: string }>({
  field,
  items,
  row: Row,
  pickable = EVERY,
}: Readonly<KeptListProps<T>>) {
  const t = useT();
  const { session, update } = useImportSession();
  const ids = items.filter(pickable).map((item) => item.id);
  const title = t(KEPT_TITLE[field]);
  return (
    <Box gap={8}>
      <Text variant="overline" color="textDim">
        {title}
      </Text>
      <ChoiceList.Root
        mode="multiple"
        size="md"
        label={title}
        value={keptIds(ids, session[field])}
        onValueChange={(kept) => update(skippedPatch(field, skippedIds(ids, kept)))}
      >
        {items.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </ChoiceList.Root>
    </Box>
  );
}

function LibraryChoice({ item: library }: Readonly<{ item: ImportLibrary }>) {
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
  return (
    <KeptList
      field="skippedLibraries"
      items={libraries}
      pickable={importable}
      row={LibraryChoice}
    />
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

function UserChoice({ item: user }: Readonly<{ item: ImportUser }>) {
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
  return <KeptList field="skippedUsers" items={users} row={UserChoice} />;
}
