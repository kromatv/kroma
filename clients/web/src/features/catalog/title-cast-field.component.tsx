import { TITLE_EDIT_LIMITS } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { Box, Button, Combobox, type ComboboxDetails, Field, IconButton } from '@kromatv/ui/kit';
import { useState } from 'react';
import {
  type CastDraft,
  type CastRow,
  withActor,
  withoutActor,
  withRow,
} from '#web/features/catalog/title-cast-draft';
import type { ReadyInfo } from '#web/features/catalog/title-info-fields.component';
import { resetAction } from '#web/features/catalog/title-info-reset';
import { faceOf, personItems } from '#web/features/catalog/person-items';
import { usePeopleSearch } from '#web/features/catalog/use-name-suggestions.hook';

type Rows = Readonly<{ cast: CastDraft; onChange: (next: CastDraft) => void }>;

type TextProps = Readonly<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (text: string) => void;
}>;

function ActorText({ label, placeholder, value, onChange }: TextProps) {
  return (
    <Field.Root flex={1} hideLabel label={label} value={value} onValueChange={onChange}>
      <Field.Input placeholder={placeholder} />
    </Field.Root>
  );
}

type Put = (change: Partial<Pick<CastRow, 'name' | 'role' | 'photo'>>) => void;

function useActorSearch(put: Put) {
  const [query, setQuery] = useState('');
  const { people, loading } = usePeopleSearch(query);
  const change = (name: string, { reason }: ComboboxDetails) => {
    if (reason === 'pick') {
      put({ name, photo: people.find((person) => person.name === name)?.photoUrl ?? null });
      return;
    }
    setQuery(name);
    put({ name, photo: null });
  };
  return { people, loading, change };
}

function ActorName({ row, n, put }: Readonly<{ row: CastRow; n: number; put: Put }>) {
  const t = useT();
  const { people, loading, change } = useActorSearch(put);
  return (
    <Field.Root flex={1} hideLabel label={t('titleInfo.actorName', { n })}>
      <Combobox.Root
        value={row.name}
        onValueChange={change}
        filter={false}
        loading={loading}
        placeholder={t('titleInfo.actorNamePlaceholder')}
      >
        {row.photo ? (
          <Combobox.Value value={row.name}>
            <Combobox.Media src={faceOf(row.photo)} />
          </Combobox.Value>
        ) : null}
        {personItems(people, Combobox)}
      </Combobox.Root>
    </Field.Root>
  );
}

function ActorRow({ row, at, cast, onChange }: Rows & Readonly<{ row: CastRow; at: number }>) {
  const t = useT();
  const n = at + 1;
  const put: Put = (change) => onChange(withRow(cast, row.key, change));
  return (
    <Box row align="center" gap={12}>
      <ActorName row={row} n={n} put={put} />
      <ActorText
        label={t('titleInfo.actorRole', { n })}
        placeholder={t('titleInfo.actorRolePlaceholder')}
        value={row.role}
        onChange={(role) => put({ role })}
      />
      <IconButton
        variant="ghost"
        control="md"
        icon="x"
        label={t('titleInfo.removeActor', { n })}
        onPress={() => onChange(withoutActor(cast, row.key))}
      />
    </Box>
  );
}

function castNote(info: ReadyInfo) {
  return info.castWritten && info.cast.shown ? 'titleInfo.resetNote' : 'titleInfo.castHint';
}

/** The cast a person writes for a film or a show: a row for each actor, with
 * their photo, their name and the part they play, in credit order, and a
 * button that adds one more up to what the server keeps. */
export function CastField({ info }: Readonly<{ info: ReadyInfo }>) {
  const t = useT();
  const { cast, onCast } = info;
  const full = cast.rows.length >= TITLE_EDIT_LIMITS.cast;
  return (
    <Field.Root label={t('titleInfo.cast')}>
      <Box gap={10}>
        {cast.rows.map((row, at) => (
          <ActorRow key={row.key} row={row} at={at} cast={cast} onChange={onCast} />
        ))}
        <Box row>
          <Button
            variant="ghost"
            size="sm"
            icon="plus"
            label={t('titleInfo.addActor')}
            disabled={full}
            onPress={() => onCast(withActor(cast))}
          />
        </Box>
      </Box>
      {resetAction(t('titleInfo.reset'), cast.shown ? null : info.resetCast)}
      <Field.Hint>{t(castNote(info))}</Field.Hint>
    </Field.Root>
  );
}
