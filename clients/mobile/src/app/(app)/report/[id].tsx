// Report a problem on a title (film / series / episode): pick a category,
// optionally describe, send. Mirrors the web client's "Signaler un probleme"
// flow (POST /api/reports).

import type { ReportCategory, ReportSubjectKind } from '@kroma/core';
import { Box, Button, Field, Icon, styles, Text } from '@kroma/ui/kit';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { PageHeader } from '#mobile/components/PageHeader';
import { Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { goBack, routeParam } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';

const CATEGORIES: { key: ReportCategory; label: string; hint: string }[] = [
  { key: 'metadata', label: 'report.category.metadata', hint: 'report.category.metadataHint' },
  { key: 'video', label: 'report.category.video', hint: 'report.category.videoHint' },
  { key: 'audio', label: 'report.category.audio', hint: 'report.category.audioHint' },
  { key: 'subtitles', label: 'report.category.subtitles', hint: 'report.category.subtitlesHint' },
  { key: 'other', label: 'report.category.other', hint: 'report.category.otherHint' },
] as const;

export default function ReportRoute() {
  const id = routeParam(useLocalSearchParams<{ id?: string }>().id);
  return id ? <ReportProblem id={id} /> : <Redirect href="/" />;
}

function ReportProblem({ id }: Readonly<{ id: string }>) {
  const { kind, title } = useLocalSearchParams<{ kind: string; title?: string }>();
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!category) return;
    setState('busy');
    setError(null);
    try {
      await client.createReport({
        subjectKind: (kind ?? 'movie') as ReportSubjectKind,
        subjectId: id,
        category,
        message: message.trim() || null,
      });
      setState('done');
      setTimeout(() => goBack(router), 1400);
    } catch {
      setState('idle');
      setError(t('report.failed'));
    }
  };

  return (
    <Screen padded={false}>
      <PageHeader title={t('report.title')} />
      {state === 'done' ? (
        <Box style={s.done}>
          <Box style={s.doneBadge}>
            <Icon name="check" size={30} thickness={2.4} color="accentInk" />
          </Box>
          <Text style={s.doneText}>{t('report.submitted')}</Text>
        </Box>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {title ? (
              <Box style={s.subjectRow}>
                <Icon name="flag" size={16} thickness={1.8} color="accentText" />
                <Text lines={1} style={s.subject}>
                  {title}
                </Text>
              </Box>
            ) : null}

            <Text style={s.group}>{t('report.category')}</Text>
            <Box style={s.cards}>
              {CATEGORIES.map((c) => {
                const active = category === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setCategory(c.key)}
                    style={({ pressed }) => [
                      s.card,
                      active && s.cardActive,
                      pressed && !active && s.cardPressed,
                    ]}
                  >
                    <Box style={s.cardText}>
                      <Text style={[s.cardLabel, active && s.cardLabelActive]}>
                        {t(c.label as never)}
                      </Text>
                      <Text style={s.cardHint}>{t(c.hint as never)}</Text>
                    </Box>
                    {active ? (
                      <Icon name="check" size={18} thickness={2.4} color="accentText" />
                    ) : null}
                  </Pressable>
                );
              })}
            </Box>

            <Text style={s.group}>{t('report.message')}</Text>
            <Field.Root
              label={t('report.messagePlaceholder')}
              hideLabel
              value={message}
              onValueChange={setMessage}
              style={s.message}
            >
              <Field.Textarea placeholder={t('report.messagePlaceholder')} rows={4} />
            </Field.Root>
            {error ? <Text style={s.error}>{error}</Text> : null}
            <Button
              label={t('report.submit')}
              onPress={() => void submit()}
              loading={state === 'busy'}
              disabled={!category}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const s = styles({
  body: { gap: spacing.sm, p: spacing.md, pb: spacing.xl * 2 },
  subjectRow: { row: true, align: 'center', gap: 8, mb: spacing.xs },
  subject: { ...type.caption, shrink: 1, color: 'text', fontWeight: '600' },
  group: { ...type.small, mt: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  cards: { gap: 8 },
  card: {
    row: true,
    between: true,
    align: 'center',
    gap: spacing.md,
    p: spacing.md,
    bg: 'surface1',
    radius: radius.md,
    border: 'transparent',
    borderWidth: 1.5,
  },
  cardActive: { bg: 'accentSoft', borderColor: 'accent' },
  cardPressed: { bg: 'surface2' },
  cardText: { flex: true, gap: 2 },
  cardLabel: { ...type.body, fontWeight: '700' },
  cardLabelActive: { color: 'accentText' },
  cardHint: { ...type.small },
  message: { minH: 96, pt: 12, textAlignVertical: 'top' },
  error: { color: 'danger', fontSize: 13 },
  done: { flex: true, center: true, gap: spacing.md },
  doneBadge: { center: true, w: 68, h: 68, bg: 'accent', radius: 34 },
  doneText: { ...type.section, textAlign: 'center' },
});
