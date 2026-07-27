// Who a person is, above their filmography: portrait, life facts, biography.
//
// Everything here comes from the metadata provider (`GET /api/people/details`)
// and is therefore optional: with nothing to show the component renders nothing
// at all and the grid keeps its old, header-less look.

import { type PersonDetail, personFacts } from '@kroma/core';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '#mobile/components/Avatar';
import { useI18n, useT } from '#mobile/lib/i18n';
import { colors, spacing, type } from '#mobile/lib/theme';

/** Lines of biography shown before "Lire la suite". Three is about a phone's
 * worth of context without pushing every poster below the fold. */
const CLAMP_LINES = 3;

export function PersonProfile({
  detail,
  photo,
  name,
  roles,
}: Readonly<{
  detail: PersonDetail | null;
  /** Portrait URL, already resolved (provider's, else a credit's). */
  photo: string | null;
  name: string;
  /** Localized roles from the library's own credits ("Acteur - Réalisateur"). */
  roles: string[];
}>) {
  const t = useT();
  const { locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const facts = personFacts(t, detail, locale);
  const biography = detail?.biography?.trim() || null;

  if (!photo && !facts.length && !biography && !roles.length) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.identity}>
        <Avatar uri={photo} name={name} size={92} />
        <View style={styles.facts}>
          {roles.length ? <Text style={styles.roles}>{roles.join(' · ')}</Text> : null}
          {facts.map((f) => (
            <View key={f.key} style={styles.fact}>
              <Text style={styles.factLabel}>{f.label}</Text>
              <Text style={styles.factValue}>{f.value}</Text>
            </View>
          ))}
        </View>
      </View>

      {biography ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? t('person.readLess') : t('person.readMore')}
        >
          <Text style={styles.group}>{t('person.biography')}</Text>
          <Text style={styles.biography} numberOfLines={expanded ? undefined : CLAMP_LINES}>
            {biography}
          </Text>
          <Text style={styles.more}>{expanded ? t('person.readLess') : t('person.readMore')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, paddingBottom: spacing.sm },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  facts: { flex: 1, gap: 6 },
  roles: { ...type.caption, color: colors.accent, fontWeight: '700' },
  fact: { gap: 1 },
  factLabel: {
    ...type.small,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  factValue: { ...type.caption, color: colors.text, fontWeight: '600' },
  group: {
    ...type.small,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  biography: { ...type.body, color: colors.textDim },
  more: { ...type.caption, color: colors.accent, fontWeight: '700', marginTop: 4 },
});
