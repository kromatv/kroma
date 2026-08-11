import type { PersonDetail } from '@kroma/core';
import { personFacts } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Avatar, Box, Chip, styles, Text } from '@kroma/ui/kit';
import { useState } from 'react';
import { TITLE } from '#tv/features/catalog/screenStyle';

// Clamped so the biography can't push the filmography's poster grid off screen.
const CLAMP_LINES = 4;
const EXPANDED_LINES = 10;
// Character-counted rather than measured: measuring text costs a layout pass
// on every target.
const EXPANDABLE_CHARS = 300;

/**
 * A person's identity block: portrait, roles, name, the life facts the
 * provider knows, and their biography. `detail` arrives after the screen has
 * already drawn (see `usePersonDetail`), so everything it feeds is additive.
 */
export function PersonHeader({
  name,
  roles,
  photo,
  titleCount,
  detail,
}: Readonly<{
  name: string;
  roles: string[];
  photo: string | null;
  titleCount: number;
  detail: PersonDetail | null;
}>) {
  const t = useT();
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const facts = personFacts(t, detail, locale);
  const biography = detail?.biography?.trim() || null;
  const expandable = !!biography && biography.length > EXPANDABLE_CHARS;

  return (
    <Box row gap={32} px={64} pt={112} pb={20}>
      <Avatar name={name} src={photo} size={132} circle />
      <Box minW={0} flex gap={8}>
        {roles.length ? (
          <Text variant="overlineTv" color="accentText">
            {roles.join(' · ')}
          </Text>
        ) : null}
        <Text variant="hero" style={TITLE}>
          {name}
        </Text>
        <Text variant="labelTv" color="textMuted">
          {t('person.titleCount', { count: titleCount })}
        </Text>

        {facts.length ? (
          <Box row wrap gap={40} mt={6}>
            {facts.map((f) => (
              <Box key={f.key} gap={3}>
                <Text variant="overlineTv" style={s.factLabel} color="text/45">
                  {f.label}
                </Text>
                <Text variant="labelTv">{f.value}</Text>
              </Box>
            ))}
          </Box>
        ) : null}

        {biography ? (
          <Box gap={10} mt={6} maxW={1180}>
            <Text
              lines={expanded ? EXPANDED_LINES : CLAMP_LINES}
              style={s.biography}
              color="text/78"
            >
              {biography}
            </Text>
            {expandable ? (
              <Box row>
                <Chip
                  variant="surface"
                  focusScale={1.05}
                  label={expanded ? t('person.readLess') : t('person.readMore')}
                  onPress={() => setExpanded((v) => !v)}
                />
              </Box>
            ) : null}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

const s = styles({
  factLabel: { fontSize: 12 },
  biography: { fontSize: 18, lineHeight: 27 },
});
