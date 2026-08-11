// Who a person is, above their filmography: portrait, life facts, biography.
//
// Data comes from `GET /api/people/details` and is optional — with nothing to
// show, the component renders nothing and the grid keeps its header-less look.

import { type PersonDetail, personFacts } from '@kroma/core';
import { Box, styles, Text } from '@kroma/ui/kit';
import { Avatar } from '#mobile/components/Avatar';
import { ExpandableText } from '#mobile/components/ui';
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
  const facts = personFacts(t, detail, locale);
  const biography = detail?.biography?.trim() || null;

  if (!photo && !facts.length && !biography && !roles.length) return null;

  return (
    <Box style={s.wrap}>
      <Box style={s.identity}>
        <Avatar uri={photo} name={name} size={92} />
        <Box style={s.facts}>
          {roles.length ? <Text style={s.roles}>{roles.join(' · ')}</Text> : null}
          {facts.map((f) => (
            <Box key={f.key} style={s.fact}>
              <Text style={s.factLabel}>{f.label}</Text>
              <Text style={s.factValue}>{f.value}</Text>
            </Box>
          ))}
        </Box>
      </Box>

      {biography ? (
        <Box>
          <Text style={s.group}>{t('person.biography')}</Text>
          {/* The kit's paragraph, like the film and series overviews on this
              app: it GROWS into its full height rather than jumping, and it
              only offers "read more" when the copy actually overflows - the
              hand-rolled version here offered it on a one-line biography. */}
          <ExpandableText lines={CLAMP_LINES} moreLabel={t('person.readMore')}>
            {biography}
          </ExpandableText>
        </Box>
      ) : null}
    </Box>
  );
}

const s = styles({
  wrap: { gap: spacing.md, pb: spacing.sm },
  identity: { row: true, align: 'center', gap: spacing.md },
  facts: { flex: true, gap: 6 },
  roles: { ...type.caption, color: 'accentText', fontWeight: '700' },
  fact: { gap: 1 },
  factLabel: { ...type.small, color: 'textDim', textTransform: 'uppercase', letterSpacing: 1 },
  factValue: { ...type.caption, color: 'text', fontWeight: '600' },
  group: { ...type.small, mb: 4, color: 'textDim', textTransform: 'uppercase', letterSpacing: 1 },
});
