import { TITLE_EDIT_LIMITS } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { Box, Button, Field, IconButton, Text } from '@kromatv/ui/kit';

import {
  type CastDraft,
  type CastRow,
  withActor,
  withoutActor,
  withRow,
} from '#web/features/catalog/title-cast-draft';

type Props = Readonly<{ cast: CastDraft; onChange: (next: CastDraft) => void }>;

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

function ActorRow({ row, at, cast, onChange }: Props & Readonly<{ row: CastRow; at: number }>) {
  const t = useT();
  const n = at + 1;
  const put = (change: Partial<Pick<CastRow, 'name' | 'role'>>) =>
    onChange(withRow(cast, row.key, change));
  return (
    <Box row align="center" gap={8}>
      <ActorText
        label={t('titleInfo.actorName', { n })}
        placeholder={t('titleInfo.actorNamePlaceholder')}
        value={row.name}
        onChange={(name) => put({ name })}
      />
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

/** The cast a person writes for a film or a show: a row for each actor, with
 * their name and the part they play, in credit order, and a button that adds
 * one more up to what the server keeps. */
export function CastField({ cast, onChange }: Props) {
  const t = useT();
  const full = cast.rows.length >= TITLE_EDIT_LIMITS.cast;
  return (
    <Box gap={8}>
      <Text variant="meta" color="textMuted">
        {t('titleInfo.cast')}
      </Text>
      {cast.rows.map((row, at) => (
        <ActorRow key={row.key} row={row} at={at} cast={cast} onChange={onChange} />
      ))}
      <Box row>
        <Button
          variant="ghost"
          size="sm"
          icon="plus"
          label={t('titleInfo.addActor')}
          disabled={full}
          onPress={() => onChange(withActor(cast))}
        />
      </Box>
      <Text variant="meta" color="textDim">
        {t('titleInfo.castHint')}
      </Text>
    </Box>
  );
}
