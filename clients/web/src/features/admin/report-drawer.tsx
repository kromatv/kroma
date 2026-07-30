// Slide-in report drawer: subject identity (category + status + kind), the
// reporter + date, the free-text message, a deep-link to the title's fiche, and
// the triage actions (resolve / dismiss / reopen / delete).

import type { Report, ReportStatus } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, IconButton } from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { createCallable } from 'react-call';
import { categoryMeta, kindLabelKey, soft, statusMeta } from '#web/features/admin/report-meta';
import { Avatar } from '#web/features/admin/ui';

// Shares the row like the old `flex-1` CTAs.
const FLEX_1 = { flex: 1 } as const;

function Header({ report, onClose }: Readonly<{ report: Report; onClose: () => void }>) {
  const t = useT();
  const cat = categoryMeta(report.category);
  const st = statusMeta(report.status);
  return (
    <div className="border-b border-white/[0.07] px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
          {t('reports.sheet')}
        </span>
        <IconButton
          variant="ghost"
          size={32}
          glyph={20}
          icon="x"
          label={t('common.close')}
          onPress={onClose}
        />
      </div>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-[9px] py-[3px] text-[9.5px] font-bold uppercase tracking-widest"
          style={{ color: cat.color, background: soft(cat.color) }}
        >
          {t(cat.labelKey)}
        </span>
        <span
          className="rounded-full px-[9px] py-[3px] text-[9.5px] font-bold uppercase tracking-widest"
          style={{ color: st.color, background: soft(st.color) }}
        >
          {t(st.labelKey)}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
          {t(kindLabelKey(report.subjectKind))}
        </span>
      </div>
      <h2 className="font-display text-[21px] font-bold leading-[1.15]">{report.subjectTitle}</h2>
    </div>
  );
}

// Open with `await ReportDrawer.call({ report, canManage, onResolve, ... })`.
// The action callbacks perform the mutation + parent list refresh + toast, so
// the queue keeps updating live while the drawer stays open.
export const ReportDrawer = createCallable<
  {
    report: Report;
    canManage: boolean;
    onResolve: (r: Report) => Promise<void>;
    onDismiss: (r: Report) => Promise<void>;
    onReopen: (r: Report) => Promise<void>;
    onDelete: (r: Report) => Promise<void>;
  },
  void
>(({ call, report: initial, canManage, onResolve, onDismiss, onReopen, onDelete }) => {
  const t = useT();
  const navigate = useNavigate();
  const [report, setReport] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  // react-call mounts us on `.call()` / unmounts on `call.end()`, so drive the
  // slide with a mount effect (in) and a delayed end (out) to keep the anim.
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const close = () => {
    setOpen(false);
    window.setTimeout(() => call.end(), 300);
  };

  // Reflect the new status locally; the parent reloads the list behind us.
  // Failures leave the report untouched (the callback surfaced its own toast).
  const run = (fn: (r: Report) => Promise<void>, next: ReportStatus) => {
    setBusy(true);
    fn(report)
      .then(() => setReport({ ...report, status: next }))
      .catch(() => {})
      .finally(() => setBusy(false));
  };
  const del = () => {
    void onDelete(report);
    close();
  };

  // Movies + shows have a fiche route; an episode item has no standalone page.
  const FICHE_ROUTES = { movie: '/movie/$id', show: '/show/$id' } as const;
  const ficheTo =
    report.subjectKind === 'movie' || report.subjectKind === 'show'
      ? FICHE_ROUTES[report.subjectKind]
      : null;

  return (
    <>
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={close}
        className={`fixed inset-0 z-60 bg-[rgba(4,4,6,.6)] backdrop-blur-[2px] transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        className="fixed right-0 top-0 z-61 flex h-screen w-[460px] max-w-full flex-col border-l border-white/9 bg-[#0E0E12] shadow-[-20px_0_60px_rgba(0,0,0,.6)] transition-transform duration-300 ease-out sm:max-w-[92vw]"
        style={{ transform: open ? 'translateX(0)' : 'translateX(105%)' }}
      >
        <Header report={report} onClose={close} />

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
            {t('reports.reportedBy')}
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#121216] px-4 py-3.5">
            <Avatar name={report.reportedByName ?? '?'} size={34} />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-bold">
                {report.reportedByName ?? t('reports.unknownUser')}
              </div>
              <div className="text-[12px] font-medium text-white/45">
                {new Date(report.createdAt).toLocaleDateString()}{' '}
                {new Date(report.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>

          {report.message ? (
            <div className="mt-4 whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-[#121216] px-4 py-3.5 text-[13.5px] leading-[1.5] text-white/80">
              {report.message}
            </div>
          ) : (
            <p className="mt-4 text-[13px] italic text-white/35">{t('reports.noMessage')}</p>
          )}

          {ficheTo ? (
            <div className="mt-4 flex">
              <Button
                variant="glass"
                size="sm"
                icon="external-link"
                label={t('reports.viewTitle')}
                onPress={() => navigate({ to: ficheTo, params: { id: report.subjectId } })}
              />
            </div>
          ) : null}
        </div>

        {canManage ? (
          <div className="flex gap-2.5 border-t border-white/[0.07] px-6 py-4.5">
            {report.status === 'open' ? (
              <>
                <Button
                  icon="check"
                  label={t('reports.actionResolve')}
                  onPress={() => run(onResolve, 'resolved')}
                  loading={busy}
                  style={FLEX_1}
                />
                <Button
                  variant="glass"
                  icon="x"
                  label={t('reports.actionDismiss')}
                  onPress={() => run(onDismiss, 'dismissed')}
                  disabled={busy}
                  style={FLEX_1}
                />
              </>
            ) : (
              <Button
                variant="glass"
                icon="arrow-back-up"
                label={t('reports.actionReopen')}
                onPress={() => run(onReopen, 'open')}
                disabled={busy}
                style={FLEX_1}
              />
            )}
            <IconButton
              size={46}
              glyph={16}
              radius={12}
              icon="trash"
              label={t('reports.actionDelete')}
              onPress={del}
              disabled={busy}
            />
          </div>
        ) : null}
      </aside>
    </>
  );
});
