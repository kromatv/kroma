// "Signaler un probleme" dialog: any logged-in user flags an issue on a movie /
// show / episode (wrong metadata, audio, video, subtitles, other) with an
// optional note. Posts to /api/reports; the server resolves the title itself.

import {
  apiErrorText,
  type MessageKey,
  type ReportCategory,
  type ReportSubjectKind,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, Field, IconButton } from '@kroma/ui/kit';
import {
  IconCheck,
  IconDotsCircleHorizontal,
  IconInfoCircle,
  IconMessage,
  IconVideo,
  IconVolume,
} from '@tabler/icons-react';
import { type ComponentType, useState } from 'react';
import { createCallable } from 'react-call';
import { useAuth } from '#web/shared/lib/auth';
import { MODAL_SCRIM } from '#web/shared/ui';

// Shares the row like the old `flex-1` CTAs.
const FLEX_1 = { flex: 1 } as const;

interface CategoryMeta {
  key: ReportCategory;
  labelKey: MessageKey;
  descKey: MessageKey;
  Icon: ComponentType<{ size?: number; stroke?: number }>;
}

// `metadata` = a wrong fiche.
const CATEGORIES: readonly CategoryMeta[] = [
  {
    key: 'metadata',
    labelKey: 'report.category.metadata',
    descKey: 'report.category.metadataHint',
    Icon: IconInfoCircle,
  },
  {
    key: 'video',
    labelKey: 'report.category.video',
    descKey: 'report.category.videoHint',
    Icon: IconVideo,
  },
  {
    key: 'audio',
    labelKey: 'report.category.audio',
    descKey: 'report.category.audioHint',
    Icon: IconVolume,
  },
  {
    key: 'subtitles',
    labelKey: 'report.category.subtitles',
    descKey: 'report.category.subtitlesHint',
    Icon: IconMessage,
  },
  {
    key: 'other',
    labelKey: 'report.category.other',
    descKey: 'report.category.otherHint',
    Icon: IconDotsCircleHorizontal,
  },
];

// Open with `await ReportDialog.call({ subjectKind, subjectId, subjectTitle })`.
// Resolves (`void`) purely on dismiss, including after a successful submit.
export const ReportDialog = createCallable<
  { subjectKind: ReportSubjectKind; subjectId: string; subjectTitle: string },
  void
>(({ call, subjectKind, subjectId, subjectTitle }) => {
  const t = useT();
  const { client } = useAuth();
  const [category, setCategory] = useState<ReportCategory>('metadata');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = () => {
    setBusy(true);
    setError(null);
    client
      .createReport({ subjectKind, subjectId, category, message: message.trim() || undefined })
      .then(() => setSent(true))
      .catch((e) => setError(apiErrorText(e, t('report.failed'))))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={() => call.end()}
        className={MODAL_SCRIM}
      />
      <div className="pointer-events-none fixed inset-0 z-61 flex items-center justify-center p-4">
        <section className="pointer-events-auto flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-bg shadow-[0_30px_90px_rgba(0,0,0,.6)]">
          <header className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-7 py-5">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
                {t('report.title')}
              </div>
              <h2 className="mt-1 truncate font-display text-[20px] font-bold">{subjectTitle}</h2>
            </div>
            <IconButton
              control="sm"
              icon="x"
              label={t('common.close')}
              onPress={() => call.end()}
            />
          </header>

          {sent ? (
            <div className="flex flex-col items-center gap-4 px-7 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
                <IconCheck size={30} stroke={2.4} />
              </span>
              <p className="text-[15px] font-semibold text-white/85">{t('report.submitted')}</p>
              <Button size="sm" label={t('common.close')} onPress={() => call.end()} />
            </div>
          ) : (
            <div className="flex-1 space-y-5 overflow-y-auto px-7 py-5">
              <div>
                <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[.12em] text-white/40">
                  {t('report.category')}
                </div>
                <div className="grid gap-2">
                  {CATEGORIES.map((c) => {
                    const on = c.key === category;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setCategory(c.key)}
                        aria-pressed={on}
                        className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                          on
                            ? 'border-accent/45 bg-accent/[0.12]'
                            : 'border-white/8 bg-surface-1 hover:bg-surface-2'
                        }`}
                      >
                        <span className={`mt-0.5 shrink-0 ${on ? 'text-accent' : 'text-white/45'}`}>
                          <c.Icon size={19} stroke={1.9} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-semibold text-white">
                            {t(c.labelKey)}
                          </span>
                          <span className="mt-0.5 block text-[12px] font-medium leading-snug text-white/45">
                            {t(c.descKey)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-white/40">
                  {t('report.message')}
                </div>
                <Field.Root label={t('report.message')} hideLabel>
                  <Field.Textarea
                    rows={3}
                    value={message}
                    onValueChange={(v) => setMessage(v.slice(0, 2000))}
                    placeholder={t('report.messagePlaceholder')}
                  />
                </Field.Root>
              </div>

              {error ? (
                <div className="rounded-lg border border-danger/18 bg-danger/8 px-3.5 py-2.5 text-[12.5px] font-semibold text-danger-hover">
                  {error}
                </div>
              ) : null}

              <div className="flex gap-2.5">
                <Button label={t('report.submit')} onPress={submit} loading={busy} style={FLEX_1} />
                <Button variant="glass" label={t('common.cancel')} onPress={() => call.end()} />
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
});
