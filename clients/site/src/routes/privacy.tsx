import { IconShieldLock } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { ContactCard } from '#site/components/contact/contact-card';
import { PageShell } from '#site/components/contact/page-shell';
import { getLocale, useLang } from '#site/lib/i18n';
import { getLegalDoc } from '#site/lib/legal';
import { seo } from '#site/lib/seo';
import { site } from '#site/lib/site';
import { m } from '#site/paraglide/messages';

export const Route = createFileRoute('/privacy')({
  // `head` runs outside React, but a message function resolves the ambient locale
  // on its own, so the same `m.*()` calls work here.
  head: () =>
    seo({
      lang: getLocale(),
      title: m.privacy_head_title(),
      description: m.privacy_head_description(),
      path: '/privacy',
    }),
  component: Privacy,
});

export function Privacy() {
  // The policy itself is a document, not UI copy: it lives as MDX per locale under
  // content/legal (see lib/legal) and only the frame around it is translated as
  // messages.
  const Policy = getLegalDoc('privacy', useLang());
  return (
    <PageShell
      size="prose"
      eyebrow={m.privacy_eyebrow()}
      title={m.privacy_title()}
      updated={m.privacy_updated()}
      intro={m.privacy_intro()}
    >
      <div className="mt-12 h-px bg-border" />

      <div className="prose-kroma mt-12">{Policy ? <Policy /> : null}</div>

      {/* A real contact affordance to close on, rather than a bare mailto in a
          paragraph, the same channel, made unmissable. */}
      <div className="mt-14">
        <ContactCard
          icon={IconShieldLock}
          title={m.privacy_card_title()}
          description={m.privacy_card_description()}
          action={site.email.privacy}
          href={`mailto:${site.email.privacy}`}
        />
      </div>
    </PageShell>
  );
}
