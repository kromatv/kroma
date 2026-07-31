import type { PersonDetail } from '@kroma/core';
import { personFacts } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Avatar, Box, Chip, styles, Txt } from '@kroma/ui/kit';
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
      <Box style={{ minWidth: 0, flex: 1 }} gap={8}>
        {roles.length ? (
          <Txt variant="overlineTv" color="accent">
            {roles.join(' · ')}
          </Txt>
        ) : null}
        <Txt variant="hero" style={TITLE}>
          {name}
        </Txt>
        <Txt style={{ fontSize: 16, fontWeight: '600' }} color="textMuted">
          {t('person.titleCount', { count: titleCount })}
        </Txt>

        {facts.length ? (
          <Box row wrap gap={40} mt={6}>
            {facts.map((f) => (
              <Box key={f.key} gap={3}>
                <Txt variant="overlineTv" style={s.factLabel} color="rgba(244, 243, 240, 0.45)">
                  {f.label}
                </Txt>
                <Txt style={s.factValue}>{f.value}</Txt>
              </Box>
            ))}
          </Box>
        ) : null}

        {biography ? (
          <Box gap={10} mt={6} style={{ maxWidth: 1180 }}>
            <Txt
              lines={expanded ? EXPANDED_LINES : CLAMP_LINES}
              style={s.biography}
              color="rgba(244, 243, 240, 0.78)"
            >
              {biography}
            </Txt>
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
  factValue: { fontSize: 17, fontWeight: '600' },
  biography: { fontSize: 18, lineHeight: 27 },
});
