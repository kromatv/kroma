// Report a problem on a title (film / series / episode): pick a category,
// optionally describe, send. Mirrors the web client's "Signaler un probleme"
// flow (POST /api/reports).

import type { ReportCategory, ReportSubjectKind } from '@kroma/core';
import { Button, Icon, styles } from '@kroma/ui/kit';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { PageHeader } from '#mobile/components/PageHeader';
import { Screen, TextField } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { goBack } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

const CATEGORIES: { key: ReportCategory; label: string; hint: string }[] = [
  { key: 'metadata', label: 'report.category.metadata', hint: 'report.category.metadataHint' },
  { key: 'video', label: 'report.category.video', hint: 'report.category.videoHint' },
  { key: 'audio', label: 'report.category.audio', hint: 'report.category.audioHint' },
  { key: 'subtitles', label: 'report.category.subtitles', hint: 'report.category.subtitlesHint' },
  { key: 'other', label: 'report.category.other', hint: 'report.category.otherHint' },
] as const;

export default function ReportProblem() {
  const { id, kind, title } = useLocalSearchParams<{ id: string; kind: string; title?: string }>();
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
        <View style={s.done}>
          <View style={s.doneBadge}>
            <Icon name="check" size={30} stroke={2.4} color={colors.accentInk} />
          </View>
          <Text style={s.doneText}>{t('report.submitted')}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {title ? (
              <View style={s.subjectRow}>
                <Icon name="flag" size={16} stroke={1.8} color={colors.accent} />
                <Text numberOfLines={1} style={s.subject}>
                  {title}
                </Text>
              </View>
            ) : null}

            <Text style={s.group}>{t('report.category')}</Text>
            <View style={s.cards}>
              {CATEGORIES.map((c) => {
                const active = category === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setCategory(c.key)}
                    style={({ pressed }) => [
                      s.card,
                      active && s.cardActive,
                      pressed && !active && { backgroundColor: colors.surfaceRaised },
                    ]}
                  >
                    <View style={s.cardText}>
                      <Text style={[s.cardLabel, active && { color: colors.accent }]}>
                        {t(c.label as never)}
                      </Text>
                      <Text style={s.cardHint}>{t(c.hint as never)}</Text>
                    </View>
                    {active ? (
                      <Icon name="check" size={18} stroke={2.4} color={colors.accent} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.group}>{t('report.message')}</Text>
            <TextField
              icon="message-2"
              value={message}
              onChangeText={setMessage}
              placeholder={t('report.messagePlaceholder')}
              multiline
              numberOfLines={4}
              style={s.message}
            />
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
  cardText: { flex: true, gap: 2 },
  cardLabel: { ...type.body, fontWeight: '700' },
  cardHint: { ...type.small },
  message: { minH: 96, pt: 12, textAlignVertical: 'top' },
  error: { color: 'danger', fontSize: 13 },
  done: { flex: true, center: true, gap: spacing.md },
  doneBadge: { center: true, w: 68, h: 68, bg: 'accent', radius: 34 },
  doneText: { ...type.section, textAlign: 'center' },
});
