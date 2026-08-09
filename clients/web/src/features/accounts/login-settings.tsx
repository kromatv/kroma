import buildInfo from 'virtual:build-info';
import { type Health, LOCALES } from '@kroma/core';
import { useLocale, useSetLocale, useT } from '@kroma/ui';
import { IconButton, Select } from '@kroma/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { CapabilityChip } from '#web/features/accounts/capability-chip';
import { serverQueries } from '#web/shared/lib/queries';

function SectionHead({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
      {children}
    </div>
  );
}

function InfoRow({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="shrink-0 text-[13px] font-medium text-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-[13px] font-semibold tabular-nums text-text">
        {value}
      </span>
    </div>
  );
}

const DIVIDER = 'my-1.5 border-t border-white/[0.07]';

/** The gate's corner gear: UI language (this device, applies immediately) and
 * a fuller report than the app sidebar's one-liner: client version, commit,
 * branch and build time, the server's identity, version and content counts,
 * and this device's playback capabilities, for checking a deployment before
 * anyone can sign in. */
export function LoginSettings() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { data: health } = useQuery({ ...serverQueries.health(), enabled: open });

  const builtMs = Date.parse(buildInfo.buildDate);
  const builtAt = Number.isNaN(builtMs)
    ? buildInfo.buildDate
    : new Date(builtMs).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const contentLine = (h: Health) =>
    [
      t('admin.libraryCount', { count: h.libraries }),
      t('settings.mediaCount', { count: h.items }),
      t('browse.count.series', { count: h.shows }),
    ].join(' · ');

  return (
    <>
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20">
        <IconButton
          icon="settings"
          variant="ghost"
          size={40}
          label={t('nav.settings')}
          onPress={() => setOpen(true)}
        />
      </div>
      {open ? (
        <>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-60 bg-[rgba(4,4,6,.66)] backdrop-blur-[3px]"
          />
          <div className="pointer-events-none fixed inset-0 z-61 flex items-center justify-center p-4">
            <section className="pointer-events-auto flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0E0E12] shadow-[0_30px_90px_rgba(0,0,0,.6)]">
              <header className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-6 py-4">
                <h2 className="font-display text-[19px] font-bold">{t('nav.settings')}</h2>
                <IconButton
                  control="sm"
                  icon="x"
                  label={t('common.close')}
                  onPress={() => setOpen(false)}
                />
              </header>
              <div className="flex flex-col overflow-y-auto px-6 py-4">
                <div className="flex items-center justify-between gap-4 py-2">
                  <span className="text-[13px] font-medium text-muted">
                    {t('account.uiLanguage')}
                  </span>
                  <Select
                    label={t('account.uiLanguage')}
                    size="sm"
                    value={locale}
                    onChange={(v) => setLocale(v as (typeof LOCALES)[number]['code'])}
                    options={LOCALES.map((l) => ({ value: l.code, label: t(l.labelKey) }))}
                  />
                </div>

                <div className={DIVIDER} />
                <SectionHead>{t('nav.versionClient')}</SectionHead>
                <InfoRow label={t('settings.version')} value={`v${buildInfo.version}`} />
                <InfoRow
                  label={t('settings.commit')}
                  value={
                    <span className="font-mono text-[12px]" title={buildInfo.commitFull}>
                      {buildInfo.commit}
                      {buildInfo.dirty ? '-dirty' : ''} · {buildInfo.branch}
                    </span>
                  }
                />
                <InfoRow label={t('settings.builtAt')} value={builtAt} />

                <div className={DIVIDER} />
                <SectionHead>
                  {t('nav.versionServer')}
                  {health ? (
                    <span className="flex min-w-0 items-center gap-1.5 normal-case tracking-normal">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          health.status === 'ok' ? 'bg-[#46D08D]' : 'bg-danger'
                        }`}
                      />
                      <span className="truncate text-[11px] font-semibold text-white/70">
                        {health.name}
                      </span>
                    </span>
                  ) : null}
                </SectionHead>
                <InfoRow
                  label={t('settings.version')}
                  value={health ? `v${health.version}` : '…'}
                />
                <InfoRow label={t('settings.content')} value={health ? contentLine(health) : '…'} />

                <div className={DIVIDER} />
                <div className="flex items-center justify-between gap-4 py-2">
                  <span className="text-[13px] font-medium text-muted">{t('nav.thisDevice')}</span>
                  <CapabilityChip />
                </div>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}
