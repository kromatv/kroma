// Admin naming: edit the naming templates with a live sample, then preview and
// apply a library-wide rename.

import { apiErrorText, Denied, ModuleFailed, ModuleLoading, useCap, useT } from '@kroma/module-sdk';
import { Button, confirm, Field, PageHeader, Section, Select, Surface } from '@kroma/ui/kit';
import { IconArrowRight } from '@tabler/icons-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTorrentsApi } from './api';
import { NamingTokenModal } from './naming-tokens';
import type { NamingTemplatesView, OrganizePlan } from './schemas';

type FieldKey = Exclude<keyof NamingTemplatesView, 'case'>;

const FIELDS: { key: FieldKey; labelKey: string }[] = [
  { key: 'movieFolder', labelKey: 'naming.movieFolder' },
  { key: 'movieFile', labelKey: 'naming.movieFile' },
  { key: 'seriesFolder', labelKey: 'naming.seriesFolder' },
  { key: 'seasonFolder', labelKey: 'naming.seasonFolder' },
  { key: 'episodeFile', labelKey: 'naming.episodeFile' },
];

const CASES: { value: string; labelKey: string }[] = [
  { value: 'default', labelKey: 'naming.caseDefault' },
  { value: 'upper', labelKey: 'naming.caseUpper' },
  { value: 'lower', labelKey: 'naming.caseLower' },
];

const MONO = { fontFamily: 'monospace', fontSize: 13 } as const;

export default function NamingPage() {
  const t = useT();
  const torrents = useTorrentsApi();
  const canManage = useCap('library.manage');

  const [tpl, setTpl] = useState<NamingTemplatesView | null>(null);
  const [failed, setFailed] = useState(false);
  const [sample, setSample] = useState<{ movie: string; episode: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    torrents
      .naming()
      .then((v) => {
        setTpl(v.templates);
        setSample(v.sample);
      })
      .catch(() => setFailed(true));
  }, [torrents]);

  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshSample = useCallback(
    (next: NamingTemplatesView) => {
      clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        torrents
          .namingSample(next)
          .then(setSample)
          .catch(() => undefined);
      }, 250);
    },
    [torrents],
  );

  const set = (key: keyof NamingTemplatesView, value: string) => {
    setTpl((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      refreshSample(next);
      setSaved(false);
      return next;
    });
  };
  const setField = (key: FieldKey) => (value: string) => set(key, value);

  const openTokens = (key: FieldKey) => {
    if (!tpl) return;
    void NamingTokenModal.call({
      fieldKey: key,
      fieldLabel: t(FIELDS.find((f) => f.key === key)?.labelKey as Parameters<typeof t>[0]),
      value: tpl[key],
      onChange: setField(key),
    });
  };

  const save = () => {
    if (!tpl) return;
    setSaving(true);
    torrents
      .saveNaming(tpl)
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      })
      .finally(() => setSaving(false));
  };

  if (!canManage) return <Denied />;
  if (!tpl) return failed ? <ModuleFailed /> : <ModuleLoading />;

  return (
    <>
      <PageHeader.Root title={t('admin.namingTitle')} subtitle={t('admin.namingSub')} />

      <Surface elevated border="border" pad="none" p={24} mt={24}>
        {tpl ? (
          <div className="flex flex-col gap-4">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex items-end gap-2">
                <Field.Root
                  label={t(f.labelKey as Parameters<typeof t>[0])}
                  value={tpl[f.key]}
                  onValueChange={(v) => set(f.key, v)}
                  flex
                >
                  <Field.Input textStyle={MONO} />
                </Field.Root>
                <Button
                  variant="glass"
                  size="sm"
                  icon="braces"
                  label={t('naming.tokens')}
                  onPress={() => openTokens(f.key)}
                />
              </div>
            ))}

            <div className="max-w-xs">
              <Field.Root label={t('naming.caseLabel')}>
                <Select.Root
                  label={t('naming.caseLabel')}
                  value={tpl.case}
                  onValueChange={(v) => set('case', v)}
                >
                  <Select.Trigger block />
                  {CASES.map((c) => (
                    <Select.Item key={c.value} value={c.value}>
                      {t(c.labelKey as Parameters<typeof t>[0])}
                    </Select.Item>
                  ))}
                </Select.Root>
              </Field.Root>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-dim">…</div>
        )}

        {sample ? (
          <div className="mt-5 rounded-xl border border-white/[0.07] bg-bg p-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
              {t('naming.preview')}
            </div>
            <SampleLine label={t('naming.exMovie')} value={sample.movie} />
            <SampleLine label={t('naming.exEpisode')} value={sample.episode} />
          </div>
        ) : null}

        <div className="mt-5 flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            label={t('common.save')}
            onPress={save}
            loading={saving}
            disabled={!tpl}
          />
          {saved ? (
            <span className="text-[13px] font-semibold text-success">{t('common.saved')}</span>
          ) : null}
        </div>
      </Surface>

      <RenameSection />
      {/* The token picker's react-call root: the page that calls it hosts it. */}
      <NamingTokenModal />
    </>
  );
}

function SampleLine({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="w-16 shrink-0 text-[11px] font-semibold text-dim">{label}</span>
      <code className="min-w-0 break-all font-mono text-[12.5px] text-info">{value}</code>
    </div>
  );
}

function RenameSection() {
  const t = useT();
  const torrents = useTorrentsApi();
  const [plan, setPlan] = useState<OrganizePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const preview = () => {
    setBusy(true);
    setResult(null);
    torrents
      .organizePreview()
      .then(setPlan)
      .catch((e) => setResult(apiErrorText(e, t('naming.previewFailed'))))
      .finally(() => setBusy(false));
  };
  const apply = () => {
    setBusy(true);
    torrents
      .organizeApply()
      .then((r) => {
        setResult(t('naming.applied', { moved: String(r.moved), failed: String(r.failed) }));
        setPlan(null);
      })
      .catch((e) => setResult(apiErrorText(e, t('naming.applyFailed'))))
      .finally(() => setBusy(false));
  };
  const askApply = async () => {
    const ok = await confirm({
      title: t('naming.confirmTitle'),
      message: t('naming.confirmBody'),
      confirmLabel: t('naming.confirmApply'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) apply();
  };

  return (
    <Section.Root
      title={t('naming.renameTitle')}
      mt={28}
      actions={
        <Button
          variant="glass"
          size="sm"
          icon="wand"
          label={t('naming.preview2')}
          onPress={preview}
          loading={busy}
        />
      }
    >
      <p className="mb-3 text-[13.5px] leading-relaxed text-dim">{t('naming.renameHelp')}</p>

      {result ? (
        <div className="mb-3 rounded-lg border border-white/8 bg-surface-1 px-4 py-2.5 text-[13px] font-semibold text-white/80">
          {result}
        </div>
      ) : null}

      {plan ? (
        <Surface elevated border="border" pad="none" p={16}>
          <div className="mb-3 text-[13px] font-semibold text-white/70">
            {t('naming.planSummary', {
              moves: String(plan.moves.length),
              matching: String(plan.matching),
              total: String(plan.totalFiles),
            })}
          </div>
          {plan.moves.length > 0 ? (
            <>
              <div className="max-h-80 overflow-y-auto rounded-xl border border-white/[0.07] bg-bg">
                {plan.moves.slice(0, 200).map((m) => (
                  <MoveRow key={`${m.from}`} from={m.from} to={m.to} />
                ))}
              </div>
              <div className="mt-4 flex">
                <Button
                  variant="primary"
                  size="sm"
                  label={t('naming.apply', { n: String(plan.moves.length) })}
                  onPress={() => void askApply()}
                  disabled={busy}
                />
              </div>
            </>
          ) : (
            <div className="py-4 text-center text-[13.5px] font-medium text-success">
              {t('naming.allMatch')}
            </div>
          )}
        </Surface>
      ) : null}
    </Section.Root>
  );
}

function MoveRow({ from, to }: Readonly<{ from: string; to: string }>): ReactNode {
  return (
    <div className="flex items-center gap-2 border-b border-white/4 px-3 py-2 text-[11.5px] last:border-0">
      <code className="min-w-0 flex-1 truncate font-mono text-white/45" title={from}>
        {from}
      </code>
      <IconArrowRight size={13} stroke={2} className="shrink-0 text-white/30" />
      <code className="min-w-0 flex-1 truncate font-mono text-info" title={to}>
        {to}
      </code>
    </div>
  );
}
