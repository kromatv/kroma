import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Divider, Field, Row, Section, Surface, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAcquisitionApi } from './api';
import { FormatPills, QualityPill, ScorePill } from './judgement-pills';
import type { ProfileVerdict, RulesTestView } from './judgement-schemas';
import { useRefusalText } from './refusal-text';
import { RulesFacts } from './rules-facts';

export function RulesTestBox() {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const [name, setName] = useState('');
  const [original, setOriginal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<RulesTestView | null>(null);

  const run = () => {
    if (name.trim() === '') return;
    setBusy(true);
    setError(null);
    acquisition
      .testRules(name.trim(), original.trim() || null)
      .then(setView)
      .catch((e) => {
        setView(null);
        setError(apiErrorText(e, t('requests.actionFailed')));
      })
      .finally(() => setBusy(false));
  };

  return (
    <Section.Root>
      <Section.Header>
        <Section.Title>{t('acq.testTitle')}</Section.Title>
      </Section.Header>

      <Text variant="meta" color="textDim">
        {t('acq.testHint')}
      </Text>

      <Row wrap gap={10} align="flex-end">
        <Box flex minW={240}>
          <Field.Root label={t('acq.testName')} size="sm" value={name} onValueChange={setName}>
            <Field.Input
              icon="flask"
              placeholder="Show.S01E02.MULTi.VFF.2160p.WEB-DL.DV.HEVC-GRP"
              onSubmit={run}
            />
          </Field.Root>
        </Box>
        <Box w={160}>
          <Field.Root
            label={t('acq.testOriginal')}
            size="sm"
            value={original}
            onValueChange={setOriginal}
          >
            <Field.Input placeholder="en" onSubmit={run} />
          </Field.Root>
        </Box>
        <Button
          size="sm"
          icon="flask"
          label={t('acq.testRun')}
          loading={busy}
          disabled={name.trim() === ''}
          onPress={run}
        />
      </Row>

      {error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{error}</Callout.Title>
        </Callout.Root>
      ) : null}

      {view ? (
        <Surface radius="xl" pad="lg">
          <Box gap={16}>
            <RulesFacts facts={view.facts} />
            <Divider color="tint/5" />
            <Box gap={14}>
              {view.profiles.map((verdict) => (
                <ProfileResult key={verdict.profileId} verdict={verdict} />
              ))}
            </Box>
          </Box>
        </Surface>
      ) : null}
    </Section.Root>
  );
}

function ProfileResult({ verdict }: Readonly<{ verdict: ProfileVerdict }>) {
  const t = useT();
  const refusalText = useRefusalText();
  const { evaluation } = verdict;
  const refusal = refusalText(verdict.refusal);
  return (
    <Box gap={8}>
      <Row wrap between gap={12} align="center">
        <Row wrap gapX={10} gapY={4} align="center">
          <Text variant="label">{verdict.profileName}</Text>
          <QualityPill quality={evaluation.quality} allowed={evaluation.qualityRank != null} />
          <Text variant="meta" color={refusal ? 'dangerHover' : 'success'}>
            {refusal ? t('acq.testRefusedBy', { reason: refusal }) : t('acq.testWouldTake')}
          </Text>
        </Row>
        <ScorePill score={evaluation.formatScore} />
      </Row>
      {evaluation.formats.length === 0 ? (
        <Text variant="meta" color="textDim">
          {t('acq.testNoFormats')}
        </Text>
      ) : (
        <FormatPills formats={evaluation.formats} />
      )}
    </Box>
  );
}
