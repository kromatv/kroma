// Who a person is, above their filmography: life facts and a biography.
//
// Fed by `GET /api/people/details` (the metadata provider), so every part of it
// is optional: with nothing to show this renders nothing and the page keeps the
// header-plus-grid it has always had.

import { type PersonDetail, personFacts } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Box, color, DataField, ExpandableText, Text } from '@kroma/ui/kit';

const RULE = { borderBottomWidth: 1, borderBottomColor: color('border') } as const;

export function PersonProfile({ detail }: Readonly<{ detail: PersonDetail | null }>) {
  const t = useT();
  const locale = useLocale();
  const facts = personFacts(t, detail, locale);
  const biography = detail?.biography?.trim() || null;

  if (!facts.length && !biography) return null;

  return (
    <section>
      <Box gap={20} mb={36} pb={28} style={RULE}>
        {facts.length ? (
          <Box row wrap gapX={40} gapY={16}>
            {facts.map((f) => (
              <DataField.Root key={f.key} size="md">
                <DataField.Label>{f.label}</DataField.Label>
                <DataField.Value>{f.value}</DataField.Value>
              </DataField.Root>
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
            <ExpandableText lines={4} color="white/70" moreLabel={t('person.readMore')}>
              {biography}
            </ExpandableText>
          </Box>
        ) : null}
      </Box>
    </section>
  );
}
