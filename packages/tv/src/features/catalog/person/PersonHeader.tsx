import type { PersonDetail } from '@kroma/core';
import { personFacts } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Avatar, Box, Chip, Txt } from '@kroma/ui/kit';
import { useState } from 'react';
import { TITLE } from '#tv/features/catalog/screenStyle';

/** How much biography fits above the filmography before it has to be asked for.
 * Four lines at this measure is roughly a paragraph's opening; the rest is one
 * click away rather than pushing the posters off the screen. */
const CLAMP_LINES = 4;
/** And how much of it "Lire la suite" reveals. Still a clamp, because the header
 * shares the screen with the filmography: an unbounded biography would squeeze
 * the poster grid down to nothing on the people who have the longest ones. */
const EXPANDED_LINES = 10;
/** Past this many characters the text is certainly longer than the clamp, so
 * the expander is worth a focus stop. Character-counted on purpose: measuring
 * text costs a layout pass on every target, and being a line out here only ever
 * shows a "Lire la suite" that reveals a little. */
const EXPANDABLE_CHARS = 300;

/**
 * A person's identity block: portrait, roles, name, the life facts the provider
 * knows, and their biography.
 *
 * `detail` arrives after the screen has already drawn (see `usePersonDetail`),
 * so everything it feeds is additive: without it this is exactly the header the
 * screen has always had, and nothing below it moves except by the height the
 * biography takes.
 */
export function PersonHeader({
  name,
  roles,
  photo,
  titleCount,
  detail,
}: Readonly<{
  name: string;
  /** Localized role chips derived from the library's own credits. */
  roles: string[];
  /** Portrait: the provider's, else the best photo among the local credits. */
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
                <Txt variant="overlineTv" style={FACT_LABEL} color="rgba(244, 243, 240, 0.45)">
                  {f.label}
                </Txt>
                <Txt style={FACT_VALUE}>{f.value}</Txt>
              </Box>
            ))}
          </Box>
        ) : null}

        {biography ? (
          <Box gap={10} mt={6} style={{ maxWidth: 1180 }}>
            <Txt
              lines={expanded ? EXPANDED_LINES : CLAMP_LINES}
              style={BIOGRAPHY}
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

/** A size down from the kit role: a fact label sits over its value, not over a
 * hero title. */
const FACT_LABEL = { fontSize: 12 };

const FACT_VALUE = { fontSize: 17, fontWeight: '600' as const };

const BIOGRAPHY = { fontSize: 18, lineHeight: 27 };
