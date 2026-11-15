import type { PersonHit } from '@kromatv/client/media';
import { posterColors } from '@kromatv/core';
import { Box, PersonCard, styles, tintGradient, useStyles } from '@kromatv/ui/kit';
import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { SectionTitle } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';

const PORTRAIT_W = 320;

/** The people a search matched by name, each opening their credits page.
 *  Nothing is drawn for a search that matched nobody. */
export function PeopleStrip({ people }: Readonly<{ people: readonly PersonHit[] }>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const client = useClient();
  const router = useRouter();
  const gutters = useGutters();
  if (people.length === 0) return null;
  return (
    <Box>
      <SectionTitle>{t('search.people')}</SectionTitle>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.strip, gutters.style]}
      >
        {people.map((person) => (
          <PersonCard
            key={person.name}
            size="sm"
            name={person.name}
            role={t('person.titleCount', { count: person.titles })}
            photo={client.media.artwork.resolve(person.profileUrl, PORTRAIT_W)}
            gradient={tintGradient(posterColors(person.name))}
            onPress={() => router.push(`/person/${encodeURIComponent(person.name)}` as never)}
          />
        ))}
      </ScrollView>
    </Box>
  );
}

const sDefinition = styles({
  strip: { gap: 12 },
});
