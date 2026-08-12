import type { ReportCategory, ReportSubjectKind } from '@kroma/core';
import { apiErrorText } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, Field, ListRow, Text, useFocusNav } from '@kroma/ui/kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEnv } from '#tv/app/providers/env';
import { useClient, useNav, useParams } from '#tv/app/router';
import { CategoryRows, GroupLabel, ReportSent, SubjectRow } from '#tv/features/reports/parts';
import { AuthScreen, UrlKeyboard } from '#tv/shared/ui';

// Long enough to read one confirmation sentence from a sofa, short enough
// not to feel stuck.
const DONE_MS = 1800;

/**
 * "Signaler un problème" from a television: pick what is affected, pick the
 * kind of problem, optionally say more, send (the same `POST /api/reports`
 * the web and mobile clients use). Typing is a step of its own rather than a
 * form field, since the on-screen keyboard needs the whole screen and most
 * viewers have nothing to add.
 */
export function TvReport() {
  const { kind, id, title, episodes } = useParams('report');
  const nav = useNav();
  const client = useClient();
  const t = useT();
  const { physicalKeyboard } = useEnv();
  const [subjectId, setSubjectId] = useState(id);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [message, setMessage] = useState('');
  const [typing, setTyping] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Back leaves the typing step first, and only then the screen otherwise the
  // remote's Back would throw away the details being typed. The handler is read
  // through a ref so it stays stable: an unstable one re-registers the remote's
  // Back key on every keystroke.
  const typingRef = useRef(typing);
  typingRef.current = typing;
  const onBack = useCallback(() => {
    if (typingRef.current) setTyping(false);
    else nav.back();
  }, [nav]);
  useFocusNav({ onBack, resetKey: typing ? 'typing' : 'form' });

  // Leaving on a timer: keep the id so a screen unmounted early (Back on the
  // confirmation) cannot navigate out from under whatever replaced it.
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (leaving.current) clearTimeout(leaving.current);
    };
  }, []);

  const submit = () => {
    if (!category || state === 'busy') return;
    setState('busy');
    setError(null);
    // An episode subject is the episode's own id; the series keeps the kind it
    // arrived with (`movie` / `show`).
    const subjectKind: ReportSubjectKind = subjectId === id ? kind : 'episode';
    client
      .createReport({
        subjectKind,
        subjectId,
        category,
        message: message.trim() || null,
      })
      .then(() => {
        setState('done');
        leaving.current = setTimeout(nav.back, DONE_MS);
      })
      .catch((e: unknown) => {
        setState('idle');
        setError(apiErrorText(e, t('report.failed')));
      });
  };

  if (state === 'done') {
    return (
      <AuthScreen>
        <ReportSent />
      </AuthScreen>
    );
  }

  if (typing) {
    return (
      <AuthScreen>
        <Box w="100%" maxW={720} gap={20}>
          <Text variant="headingTv">{t('report.message')}</Text>
          <Field.Root
            label={t('report.message')}
            hideLabel
            value={message}
            onValueChange={setMessage}
          >
            <Field.Input
              icon="message"
              placeholder={t('report.messagePlaceholder')}
              physicalKeyboard={physicalKeyboard}
              onSubmit={() => setTyping(false)}
            />
          </Field.Root>
          <UrlKeyboard
            value={message}
            onValueChange={setMessage}
            onSubmit={() => setTyping(false)}
            submitLabel={t('common.done')}
          />
        </Box>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <Box w="100%" maxW={720} gap={24}>
        <Box gap={6}>
          <Text variant="headingTv">{t('report.title')}</Text>
          <Text lines={1} variant="labelTv" color="accentText">
            {title}
          </Text>
        </Box>

        {episodes?.length ? (
          <SubjectRow
            episodes={episodes}
            selectedId={subjectId}
            wholeId={id}
            onSelect={setSubjectId}
          />
        ) : null}

        <CategoryRows selected={category} onSelect={setCategory} />

        <Box gap={12}>
          <GroupLabel text={t('report.message')} />
          <ListRow.Root icon="message" onPress={() => setTyping(true)}>
            <ListRow.Label>{t('report.addMessage')}</ListRow.Label>
            <ListRow.Hint>{message.trim() || t('report.messageEmpty')}</ListRow.Hint>
          </ListRow.Root>
        </Box>

        {error ? (
          <Text variant="labelTv" color="danger">
            {error}
          </Text>
        ) : null}

        <Button
          size="lg"
          block
          icon="flag"
          disabled={!category || state === 'busy'}
          label={t('report.submit')}
          onPress={submit}
        />
      </Box>
    </AuthScreen>
  );
}
