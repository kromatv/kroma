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
import {
  Box,
  Callout,
  color,
  Dialog,
  Field,
  Focusable,
  IconButton,
  Row,
  sv,
  Text,
} from '@kroma/ui/kit';
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

const categoryRow = sv({
  base: {
    row: true,
    align: 'flex-start',
    gap: 12,
    radius: 'xl',
    px: 14,
    py: 12,
    border: 'white/8',
    bg: 'surface1',
    _hover: { bg: 'surface2' },
  },
  variants: {
    on: {
      true: { border: 'accent/45', bg: 'accent/12', _hover: { bg: 'accent/12' } },
      false: {},
    },
  },
  defaults: { on: false },
});

interface CategoryMeta {
  key: ReportCategory;
  labelKey: MessageKey;
  descKey: MessageKey;
  Icon: ComponentType<{ size?: number; stroke?: number; color?: string }>;
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
    <Dialog.Root open title={subjectTitle} width="md" onClose={() => call.end()}>
      <Dialog.Header>
        <Row between align="flex-start" gap={16}>
          <Box minW={0}>
            <Text variant="overline" color="white/40">
              {t('report.title')}
            </Text>
            <Text variant="title" mt={4} lines={1}>
              {subjectTitle}
            </Text>
          </Box>
          <IconButton control="sm" icon="x" label={t('common.close')} onPress={() => call.end()} />
        </Row>
      </Dialog.Header>

      <Dialog.Panel>
        {sent ? (
          <Box align="center" gap={16} py={32}>
            <Box center w={56} h={56} radius="circle" bg="success/15">
              <IconCheck size={30} stroke={2.4} color={color('success')} />
            </Box>
            <Text variant="label" color="white/85" textAlign="center">
              {t('report.submitted')}
            </Text>
          </Box>
        ) : (
          <>
            <Box>
              <Text variant="overline" color="white/40" mb={10}>
                {t('report.category')}
              </Text>
              <Box gap={8}>
                {CATEGORIES.map((c) => {
                  const on = c.key === category;
                  return (
                    <Focusable
                      key={c.key}
                      sv={categoryRow}
                      vars={{ on }}
                      role="radio"
                      checked={on}
                      label={t(c.labelKey)}
                      onPress={() => setCategory(c.key)}
                    >
                      <Box mt={2} shrink={0}>
                        <c.Icon size={19} stroke={1.9} color={color(on ? 'accent' : 'white/45')} />
                      </Box>
                      <Box minW={0}>
                        <Text variant="label" color="white">
                          {t(c.labelKey)}
                        </Text>
                        <Text variant="meta" color="white/45" mt={2}>
                          {t(c.descKey)}
                        </Text>
                      </Box>
                    </Focusable>
                  );
                })}
              </Box>
            </Box>

            <Box>
              <Text variant="overline" color="white/40" mb={8}>
                {t('report.message')}
              </Text>
              <Field.Root label={t('report.message')} hideLabel>
                <Field.Textarea
                  rows={3}
                  value={message}
                  onValueChange={(v) => setMessage(v.slice(0, 2000))}
                  placeholder={t('report.messagePlaceholder')}
                />
              </Field.Root>
            </Box>

            {error ? (
              <Callout.Root tone="danger">
                <Callout.Title>{error}</Callout.Title>
              </Callout.Root>
            ) : null}
          </>
        )}
      </Dialog.Panel>

      <Dialog.Footer>
        {sent ? (
          <Dialog.Actions onCancel={() => call.end()} cancelLabel={t('common.close')} />
        ) : (
          <Dialog.Actions
            onCancel={() => call.end()}
            cancelLabel={t('common.cancel')}
            onConfirm={submit}
            confirmLabel={t('report.submit')}
            busy={busy}
          />
        )}
      </Dialog.Footer>
    </Dialog.Root>
  );
});
