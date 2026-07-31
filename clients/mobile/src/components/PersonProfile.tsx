// Who a person is, above their filmography: portrait, life facts, biography.
//
// Data comes from `GET /api/people/details` and is optional — with nothing to
// show, the component renders nothing and the grid keeps its header-less look.

import { type PersonDetail, personFacts } from '@kroma/core';
import { styles } from '@kroma/ui/kit';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Avatar } from '#mobile/components/Avatar';
import { useI18n, useT } from '#mobile/lib/i18n';
import { spacing, type } from '#mobile/lib/theme';

const CLAMP_LINES = 3;

export function PersonProfile({
  detail,
  photo,
  name,
  roles,
}: Readonly<{
  detail: PersonDetail | null;
  photo: string | null;
  name: string;
  roles: string[];
}>) {
  const t = useT();
  const { locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const facts = personFacts(t, detail, locale);
  const biography = detail?.biography?.trim() || null;

  if (!photo && !facts.length && !biography && !roles.length) return null;

  return (
    <View style={s.wrap}>
      <View style={s.identity}>
        <Avatar uri={photo} name={name} size={92} />
        <View style={s.facts}>
          {roles.length ? <Text style={s.roles}>{roles.join(' · ')}</Text> : null}
          {facts.map((f) => (
            <View key={f.key} style={s.fact}>
              <Text style={s.factLabel}>{f.label}</Text>
              <Text style={s.factValue}>{f.value}</Text>
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
          <Text style={s.group}>{t('person.biography')}</Text>
          <Text style={s.biography} numberOfLines={expanded ? undefined : CLAMP_LINES}>
            {biography}
          </Text>
          <Text style={s.more}>{expanded ? t('person.readLess') : t('person.readMore')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = styles({
  wrap: { gap: spacing.md, pb: spacing.sm },
  identity: { row: true, align: 'center', gap: spacing.md },
  facts: { flex: true, gap: 6 },
  roles: { ...type.caption, color: 'accent', fontWeight: '700' },
  fact: { gap: 1 },
  factLabel: { ...type.small, color: 'textDim', textTransform: 'uppercase', letterSpacing: 1 },
  factValue: { ...type.caption, color: 'text', fontWeight: '600' },
  group: { ...type.small, mb: 4, color: 'textDim', textTransform: 'uppercase', letterSpacing: 1 },
  biography: { ...type.body, color: 'textMuted' },
  more: { ...type.caption, mt: 4, color: 'accent', fontWeight: '700' },
});
