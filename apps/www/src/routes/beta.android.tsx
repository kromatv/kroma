import { IconArrowLeft, IconBrandAndroid, IconDeviceTv, IconMail } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { Container } from '#site/components/container';
import { JoinButton } from '#site/components/download/join-button';
import { join, ProseLink } from '#site/components/download/links';
import { StepList } from '#site/components/download/step-list';
import { L } from '#site/components/localized-link';
import { WheelMark } from '#site/components/wheel-mark';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';
import { m } from '#site/paraglide/messages';

export const Route = createFileRoute('/beta/android')({
  head: () =>
    seo({
      lang: getLocale(),
      title: m.android_beta_head_title(),
      description: m.android_beta_lead(),
      path: '/beta/android',
    }),
  component: AndroidBeta,
});

function AndroidBeta() {
  return (
    <section className="relative overflow-hidden pb-16 pt-8 sm:pb-24 sm:pt-12">
      <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-80 opacity-25" />
      <Container>
        <div className="relative mx-auto max-w-4xl">
          <L
            to="/download"
            className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-text"
          >
            <IconArrowLeft size={16} aria-hidden />
            {m.android_beta_back()}
          </L>
          <header className="mb-9 mt-10 max-w-2xl sm:mb-12">
            <WheelMark size={56} className="mb-7" />
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-accent-text">
              Android · Android TV
            </p>
            <h1 className="font-display text-5xl font-extrabold leading-none tracking-tight text-text sm:text-7xl">
              {m.android_beta_title()}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-muted">{m.android_beta_lead()}</p>
          </header>

          <div className="grid gap-5 sm:grid-cols-2">
            <article className="flex flex-col rounded-3xl border border-border-strong bg-surface-1 p-6 sm:p-8">
              <IconBrandAndroid size={28} className="mb-5 text-accent-text" aria-hidden />
              <h2 className="font-display text-2xl font-bold text-text">
                {m.android_beta_mobile_title()}
              </h2>
              <p className="mb-6 mt-3 text-sm leading-relaxed text-muted">
                {m.android_beta_mobile_body()}
              </p>
              <StepList
                steps={[
                  m.android_beta_mobile_step_1(),
                  m.android_beta_mobile_step_2(),
                  m.android_beta_mobile_step_3(),
                ]}
              />
              <div className="mt-auto pt-7">
                <JoinButton
                  href={join.firebase}
                  channel="Firebase App Distribution"
                  label={m.android_beta_join_mobile()}
                />
              </div>
            </article>
            <article className="flex flex-col rounded-3xl border border-border bg-surface-1 p-6 sm:p-8">
              <IconDeviceTv size={28} className="mb-5 text-accent-text" aria-hidden />
              <h2 className="font-display text-2xl font-bold text-text">Google Play</h2>
              <p className="mt-3 text-sm font-semibold text-accent-text">
                {m.android_beta_play_status()}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                {m.android_beta_play_body()}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted">{m.android_beta_tv_body()}</p>
              <L
                to="/download"
                className="mt-auto block pt-7 text-sm font-semibold text-accent-text underline underline-offset-4"
              >
                {m.android_beta_direct_download()}
              </L>
            </article>
          </div>

          <div className="mt-7 rounded-2xl border border-border p-6 sm:p-8">
            <h2 className="font-display text-xl font-bold text-text">
              {m.android_beta_before_title()}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {m.android_beta_before_body()}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {m.android_beta_feedback_body()}
            </p>
            <div className="mt-5 flex items-center gap-2 text-accent-text">
              <IconMail size={17} aria-hidden />
              <ProseLink href="mailto:support@kroma.tv">support@kroma.tv</ProseLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
