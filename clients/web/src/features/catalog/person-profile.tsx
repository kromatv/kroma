// Who a person is, above their filmography: life facts and a biography.
//
// Fed by `GET /api/people/details` (the metadata provider), so every part of it
// is optional: with nothing to show this renders nothing and the page keeps the
// header-plus-grid it has always had.

import { type PersonDetail, personFacts } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { Button, Text } from '@kroma/ui/kit';
import { useState } from 'react';

const READ_MORE = { fontSize: 13, fontWeight: '700' } as const;

export function PersonProfile({ detail }: Readonly<{ detail: PersonDetail | null }>) {
  const t = useT();
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const facts = personFacts(t, detail, locale);
  const biography = detail?.biography?.trim() || null;

  if (!facts.length && !biography) return null;

  return (
    <section className="mb-9 grid gap-5 border-border/60 border-b pb-7">
      {facts.length ? (
        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          {facts.map((f) => (
            <div key={f.key}>
              <dt className="text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
                {f.label}
              </dt>
              <dd className="mt-1 text-[14.5px] font-semibold text-white/85">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {biography ? (
        <div className="max-w-3xl">
          <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
            {t('person.biography')}
          </h2>
          <p
            className={`text-[15px] leading-relaxed text-white/70 ${expanded ? '' : 'line-clamp-4'}`}
          >
            {biography}
          </p>
          <div className="mt-2 flex">
            <Button variant="ghost" size="sm" onPress={() => setExpanded((v) => !v)}>
              <Text color="accent" style={READ_MORE}>
                {expanded ? t('person.readLess') : t('person.readMore')}
              </Text>
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
