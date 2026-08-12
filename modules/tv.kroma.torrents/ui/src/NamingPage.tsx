// Admin naming: edit the naming templates with a live sample, then preview and
// apply a library-wide rename.

import { apiErrorText, Denied, ModuleFailed, ModuleLoading, useCap, useT } from '@kroma/module-sdk';
import {
  Box,
  Button,
  Callout,
  confirm,
  Field,
  Icon,
  PageHeader,
  Row,
  Section,
  Select,
  Surface,
  styles,
  Text,
} from '@kroma/ui/kit';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
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

const SAMPLE_PATH: CSSProperties = {
  minWidth: 0,
  overflowWrap: 'anywhere',
  font: 'var(--type-meta)',
  fontFamily: 'var(--font-mono)',
  color: 'var(--kroma-info)',
};

const MOVE_LIST: CSSProperties = {
  maxHeight: 320,
  overflowY: 'auto',
  borderRadius: 'var(--radius-xl)',
  border: '1px solid color-mix(in srgb, var(--kroma-tint) 7%, transparent)',
  background: 'var(--kroma-bg)',
};

const MOVE_PATH: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  font: 'var(--type-meta)',
  fontFamily: 'var(--font-mono)',
};

const MOVE_FROM: CSSProperties = { ...MOVE_PATH, color: 'var(--kroma-text-dim)' };
const MOVE_TO: CSSProperties = { ...MOVE_PATH, color: 'var(--kroma-info)' };

const s = styles({
  moveRule: { borderBottomWidth: 1, borderBottomColor: 'tint/4' },
});

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
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.namingTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.namingSub')}</PageHeader.Subtitle>
      </PageHeader.Root>

      <Surface elevated border="border" pad="none" p={24} mt={24}>
        <Box gap={16}>
          {FIELDS.map((f) => (
            <Row key={f.key} align="flex-end" gap={8}>
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
            </Row>
          ))}

          <Box maxW={320}>
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
          </Box>
        </Box>

        {sample ? (
          <Box mt={20} radius="xl" border="tint/7" bg="bg" p={16}>
            <Text variant="overline" color="textDim" mb={8}>
              {t('naming.preview')}
            </Text>
            <SampleLine label={t('naming.exMovie')} value={sample.movie} />
            <SampleLine label={t('naming.exEpisode')} value={sample.episode} />
          </Box>
        ) : null}

        <Row gap={12} mt={20}>
          <Button
            variant="primary"
            size="sm"
            label={t('common.save')}
            onPress={save}
            loading={saving}
            disabled={!tpl}
          />
          {saved ? (
            <Text variant="meta" color="success">
              {t('common.saved')}
            </Text>
          ) : null}
        </Row>
      </Surface>

      <RenameSection />
      {/* The token picker's react-call root: the page that calls it hosts it. */}
      <NamingTokenModal />
    </>
  );
}

function SampleLine({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Row align="baseline" gap={8} py={2}>
      <Text variant="meta" color="textDim" w={64} shrink={0}>
        {label}
      </Text>
      <code style={SAMPLE_PATH}>{value}</code>
    </Row>
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
    <Section.Root mt={28}>
      <Section.Header>
        <Section.Title>{t('naming.renameTitle')}</Section.Title>
        <Section.Actions>
          <Button
            variant="glass"
            size="sm"
            icon="wand"
            label={t('naming.preview2')}
            onPress={preview}
            loading={busy}
          />
        </Section.Actions>
      </Section.Header>
      <Text variant="meta" color="textDim" mb={12}>
        {t('naming.renameHelp')}
      </Text>

      {result ? (
        <Box mb={12}>
          <Callout.Root size="sm">
            <Callout.Title>{result}</Callout.Title>
          </Callout.Root>
        </Box>
      ) : null}

      {plan ? (
        <Surface elevated border="border" pad="none" p={16}>
          <Text variant="meta" color="textMuted" mb={12}>
            {t('naming.planSummary', {
              moves: String(plan.moves.length),
              matching: String(plan.matching),
              total: String(plan.totalFiles),
            })}
          </Text>
          {plan.moves.length > 0 ? (
            <>
              <div style={MOVE_LIST}>
                {plan.moves.slice(0, 200).map((m, index, shown) => (
                  <MoveRow
                    key={`${m.from}`}
                    from={m.from}
                    to={m.to}
                    last={index === shown.length - 1}
                  />
                ))}
              </div>
              <Row mt={16}>
                <Button
                  variant="primary"
                  size="sm"
                  label={t('naming.apply', { n: String(plan.moves.length) })}
                  onPress={() => void askApply()}
                  disabled={busy}
                />
              </Row>
            </>
          ) : (
            <Box py={16}>
              <Text variant="meta" color="success" textAlign="center">
                {t('naming.allMatch')}
              </Text>
            </Box>
          )}
        </Surface>
      ) : null}
    </Section.Root>
  );
}

function MoveRow({
  from,
  to,
  last,
}: Readonly<{ from: string; to: string; last: boolean }>): ReactNode {
  return (
    <Row gap={8} px={12} py={8} style={last ? undefined : s.moveRule}>
      <code title={from} style={MOVE_FROM}>
        {from}
      </code>
      <Box shrink={0}>
        <Icon name="arrow-right" size={13} thickness={2} color="glyphDim" />
      </Box>
      <code title={to} style={MOVE_TO}>
        {to}
      </code>
    </Row>
  );
}
