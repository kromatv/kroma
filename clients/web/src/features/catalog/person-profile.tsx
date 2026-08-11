// Who a person is, above their filmography: life facts and a biography.
//
// Fed by `GET /api/people/details` (the metadata provider), so every part of it
// is optional: with nothing to show this renders nothing and the page keeps the
// header-plus-grid it has always had.

import { type PersonDetail, personFacts } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Box, Button, color, DataField, Text } from '@kroma/ui/kit';
import { useState } from 'react';

const READ_MORE = { fontWeight: '700' } as const;
const RULE = { borderBottomWidth: 1, borderBottomColor: color('border') } as const;

export function PersonProfile({ detail }: Readonly<{ detail: PersonDetail | null }>) {
  const t = useT();
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const facts = personFacts(t, detail, locale);
  const biography = detail?.biography?.trim() || null;

  if (!facts.length && !biography) return null;

  return (
    <section>
      <Box gap={20} mb={36} pb={28} style={RULE}>
        {facts.length ? (
          <Box row wrap gapX={40} gapY={16}>
            {facts.map((f) => (
              <DataField.Root key={f.key} size="md" label={f.label} value={f.value} />
            ))}
          </Box>
        ) : null}

        {biography ? (
          <Box maxW={768}>
            <h2>
              <Text variant="overline" color="white/40" mb={8}>
                {t('person.biography')}
              </Text>
            </h2>
            <Text variant="body" color="white/70" lines={expanded ? undefined : 4}>
              {biography}
            </Text>
            <Box row mt={8}>
              <Button variant="ghost" size="sm" onPress={() => setExpanded((v) => !v)}>
                <Text variant="meta" color="accent" style={READ_MORE}>
                  {expanded ? t('person.readLess') : t('person.readMore')}
                </Text>
              </Button>
            </Box>
          </Box>
        ) : null}
      </Box>
    </section>
  );
}
