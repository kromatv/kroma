import type { RuledTitle, TitleRule } from '@kromatv/client/admin';
import type { SearchHit } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { Box, Button, Field, ListRow, Row, Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';

type OnRule = (title: string, rule: TitleRule | null) => void;

const FOUND = 5;
const MIN_QUERY = 2;

/** The titles blocked or allowed for one profile, and, once the admin has
 * confirmed their password (`onRule` set), a finder to add one and a way to
 * lift each (ACCT-117 to ACCT-121). */
export function TitleRules({
  titles,
  onRule,
}: Readonly<{ titles: readonly RuledTitle[]; onRule: OnRule | undefined }>) {
  const t = useT();
  return (
    <Box mt={16}>
      <Text variant="overline" color="textDim" mb={8}>
        {t('admin.titleRules')}
      </Text>
      <Text variant="meta" color="textDim" mb={8}>
        {t('admin.titleRulesHint')}
      </Text>
      {titles.length === 0 ? (
        <Text variant="meta" color="textMuted">
          {t('admin.titleRulesEmpty')}
        </Text>
      ) : null}
      {titles.map((title) => (
        <RuledRow key={title.id} title={title} onRule={onRule} />
      ))}
      {onRule ? <TitleFinder onRule={onRule} /> : null}
    </Box>
  );
}

function RuledRow({ title, onRule }: Readonly<{ title: RuledTitle; onRule: OnRule | undefined }>) {
  const t = useT();
  return (
    <ListRow.Root size="md">
      <ListRow.Label>{title.name}</ListRow.Label>
      <ListRow.Hint>
        {title.rule === 'block' ? t('admin.titleBlocked') : t('admin.titleAllowed')}
      </ListRow.Hint>
      {onRule ? (
        <ListRow.Trailing>
          <Button
            variant="glass"
            size="sm"
            label={t('admin.titleLift')}
            onPress={() => onRule(title.id, null)}
          />
        </ListRow.Trailing>
      ) : null}
    </ListRow.Root>
  );
}

function TitleFinder({ onRule }: Readonly<{ onRule: OnRule }>) {
  const t = useT();
  const { client } = useAuth();
  const [typed, setTyped] = useState('');
  const query = typed.trim();
  const found = useQuery({
    queryKey: ['admin', 'restrictions', 'find', query],
    queryFn: async () => (await client.media.search(query, { limit: FOUND })).results,
    enabled: query.length >= MIN_QUERY,
  });
  return (
    <Box mt={12}>
      <Field.Root label={t('admin.titleFind')}>
        <Field.Input icon="search" value={typed} onValueChange={setTyped} />
      </Field.Root>
      {(found.data ?? []).flatMap(wholeTitle).map((title) => (
        <FoundRow key={title.id} title={title} onRule={onRule} />
      ))}
    </Box>
  );
}

interface FoundTitle {
  id: string;
  name: string;
  year: number | null | undefined;
}

function wholeTitle(hit: SearchHit): FoundTitle[] {
  if (hit.type === 'movie') {
    return [{ id: hit.item.id, name: hit.item.title, year: hit.item.year }];
  }
  if (hit.type === 'show') {
    return [{ id: hit.show.id, name: hit.show.title, year: hit.show.year }];
  }
  return [];
}

function FoundRow({ title, onRule }: Readonly<{ title: FoundTitle; onRule: OnRule }>) {
  const t = useT();
  return (
    <ListRow.Root size="md">
      <ListRow.Label>{title.name}</ListRow.Label>
      {title.year ? <ListRow.Hint>{String(title.year)}</ListRow.Hint> : null}
      <ListRow.Trailing>
        <Row gap={8}>
          <Button
            variant="glass"
            size="sm"
            label={t('admin.titleBlock')}
            onPress={() => onRule(title.id, 'block')}
          />
          <Button
            variant="glass"
            size="sm"
            label={t('admin.titleAllow')}
            onPress={() => onRule(title.id, 'allow')}
          />
        </Row>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}
