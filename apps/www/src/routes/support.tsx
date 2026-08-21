import { site } from '@kroma/site-meta';
import { IconBook, IconBrandGithub, IconBug, IconCircleCheck, IconMail } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { Button } from '#site/components/button';
import { ContactCard } from '#site/components/contact/contact-card';
import { Faq } from '#site/components/contact/faq';
import { PageShell } from '#site/components/contact/page-shell';
import { L } from '#site/components/localized-link';
import { Rich } from '#site/components/rich';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';
import { m } from '#site/paraglide/messages';

export const Route = createFileRoute('/support')({
  head: () =>
    seo({
      lang: getLocale(),
      title: m.support_head_title(),
      description: m.support_head_description(),
      path: '/support',
    }),
  component: Support,
});

const channels = [
  {
    icon: IconBrandGithub,
    href: `${site.repo}/issues`,
    title: m.support_channel_issues_title,
    description: m.support_channel_issues_description,
    action: m.support_channel_issues_action,
  },
  {
    icon: IconBook,
    href: `${site.repo}/blob/main/INSTALL.md`,
    title: m.support_channel_install_title,
    description: m.support_channel_install_description,
    action: m.support_channel_install_action,
  },
  {
    icon: IconBook,
    href: site.repo,
    title: m.support_channel_docs_title,
    description: m.support_channel_docs_description,
    action: m.support_channel_docs_action,
  },
] as const;

const bugItems = [
  m.support_bug_item1,
  m.support_bug_item2,
  m.support_bug_item3,
  m.support_bug_item4,
] as const;

const installHref = `${site.repo}/blob/main/INSTALL.md`;

function Support() {
  // Built here, not at module scope, so every string resolves in the locale
  // being rendered.
  const faqItems = [
    { question: m.support_faq_q1(), answer: m.support_faq_a1() },
    { question: m.support_faq_q2(), answer: m.support_faq_a2() },
    {
      question: m.support_faq_q3(),
      answer: (
        <>
          {m.support_faq_a3_before()}{' '}
          <a href={installHref} target="_blank" rel="noreferrer noopener">
            {m.support_faq_a3_link()}
          </a>{' '}
          {m.support_faq_a3_after()}
        </>
      ),
    },
    {
      question: m.support_faq_q4(),
      answer: (
        <>
          {m.support_faq_a4_before()} <L to="/privacy">{m.support_faq_a4_link()}</L>.
        </>
      ),
    },
  ];

  return (
    <PageShell eyebrow={m.support_eyebrow()} title={m.support_title()} intro={m.support_intro()}>
      <div className="surface-hairline mt-14 flex flex-col gap-6 rounded-2xl border border-border-strong bg-surface-1 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
        <div className="max-w-xl">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
            <IconMail size={24} stroke={1.75} aria-hidden />
          </div>
          <h2 className="mt-5 font-display text-2xl font-bold text-text">
            {m.support_email_title()}
          </h2>
          <p className="mt-2 leading-relaxed text-muted">{m.support_email_body()}</p>
        </div>
        <div className="shrink-0">
          <Button href={`mailto:${site.email.support}`} size="lg">
            <IconMail size={18} stroke={1.75} aria-hidden />
            {site.email.support}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {channels.map(({ icon, href, title, description, action }) => (
          <ContactCard
            key={href}
            icon={icon}
            href={href}
            title={title()}
            description={description()}
            action={action()}
          />
        ))}
      </div>

      <section className="mt-20">
        <div className="max-w-2xl">
          <div className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
            <IconBug size={22} stroke={1.75} aria-hidden />
          </div>
          <h2 className="mt-5 font-display text-2xl font-bold text-text sm:text-3xl">
            {m.support_bug_title()}
          </h2>
          <p className="mt-3 leading-relaxed text-muted">{m.support_bug_intro()}</p>
        </div>

        <ul className="mt-8 flex max-w-2xl flex-col gap-4">
          {bugItems.map((item) => {
            const text = item();
            return (
              <li key={text} className="flex items-start gap-3">
                <IconCircleCheck
                  size={22}
                  stroke={1.75}
                  className="mt-0.5 shrink-0 text-accent-text"
                  aria-hidden
                />
                <span className="leading-relaxed text-muted">
                  <Rich>{text}</Rich>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-8">
          <Button href={`${site.repo}/issues`} variant="outline">
            <IconBrandGithub size={18} stroke={1.75} aria-hidden />
            {m.support_bug_button()}
          </Button>
        </div>
      </section>

      <section className="mt-20">
        <h2 className="font-display text-2xl font-bold text-text sm:text-3xl">
          {m.support_faq_title()}
        </h2>
        <div className="mt-8">
          <Faq items={faqItems} />
        </div>
      </section>
    </PageShell>
  );
}
