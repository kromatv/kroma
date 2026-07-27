// Report a problem on a title (film / series / episode): pick a category,
// optionally describe, send. Mirrors the web client's "Signaler un probleme"
// flow (POST /api/reports).

import type { ReportCategory, ReportSubjectKind } from '@kroma/core';
import { Button, Icon } from '@kroma/ui/kit';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
        <View style={styles.done}>
          <View style={styles.doneBadge}>
            <Icon name="check" size={30} stroke={2.4} color={colors.accentInk} />
          </View>
          <Text style={styles.doneText}>{t('report.submitted')}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {title ? (
              <View style={styles.subjectRow}>
                <Icon name="flag" size={16} stroke={1.8} color={colors.accent} />
                <Text numberOfLines={1} style={styles.subject}>
                  {title}
                </Text>
              </View>
            ) : null}

            <Text style={styles.group}>{t('report.category')}</Text>
            <View style={styles.cards}>
              {CATEGORIES.map((c) => {
                const active = category === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setCategory(c.key)}
                    style={({ pressed }) => [
                      styles.card,
                      active && styles.cardActive,
                      pressed && !active && { backgroundColor: colors.surfaceRaised },
                    ]}
                  >
                    <View style={styles.cardText}>
                      <Text style={[styles.cardLabel, active && { color: colors.accent }]}>
                        {t(c.label as never)}
                      </Text>
                      <Text style={styles.cardHint}>{t(c.hint as never)}</Text>
                    </View>
                    {active ? (
                      <Icon name="check" size={18} stroke={2.4} color={colors.accent} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.group}>{t('report.message')}</Text>
            <TextField
              icon="message-2"
              value={message}
              onChangeText={setMessage}
              placeholder={t('report.messagePlaceholder')}
              multiline
              numberOfLines={4}
              style={styles.message}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
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

const styles = StyleSheet.create({
  body: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.xs },
  subject: { ...type.caption, color: colors.text, fontWeight: '600', flexShrink: 1 },
  group: {
    ...type.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  cards: { gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cardActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  cardText: { flex: 1, gap: 2 },
  cardLabel: { ...type.body, fontWeight: '700' },
  cardHint: { ...type.small },
  message: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 13 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  doneBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { ...type.section, textAlign: 'center' },
});
