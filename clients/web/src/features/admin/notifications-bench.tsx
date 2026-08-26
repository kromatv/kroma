// Sending a notification from the console. There is no test/dry-run mode: send
// goes through the same pipeline as a producer's notification (category
// preferences, per-recipient rendering, the stored row, the live bell, the push
// fan-out), so "everyone" reaches every account for real.

import type { MessageKey, Notification } from '@kroma/core';
import { NOTIFICATION_CATEGORY_LABEL } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  ChoiceList,
  color,
  Divider,
  Field,
  Icon,
  Row,
  Select,
  Surface,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { useAsyncAction } from '#web/features/admin/hooks';
import { NotificationImageField } from '#web/features/admin/notification-image-field';
import { kromaClient } from '#web/shared/lib/api';
import { NotificationCard } from '#web/shared/ui/notification-card';

type Target = 'me' | 'admins' | 'everyone';
type Category = Notification['category'];

const TARGETS: { value: Target; label: MessageKey; hint: MessageKey }[] = [
  { value: 'me', label: 'admin.notifTargetMe', hint: 'admin.notifTargetMeHint' },
  { value: 'admins', label: 'admin.notifTargetAdmins', hint: 'admin.notifTargetAdminsHint' },
  { value: 'everyone', label: 'admin.notifTargetEveryone', hint: 'admin.notifTargetEveryoneHint' },
];

/** What the form holds, and one to one what the server is asked to send. */
interface Draft {
  title: string;
  body: string;
  category: Category;
  link: string;
  imageUrl: string;
}

const EMPTY: Draft = { title: '', body: '', category: 'system', link: '', imageUrl: '' };

export function NotificationBench() {
  const t = useT();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [target, setTarget] = useState<Target>('me');
  const [sent, setSent] = useState<number | null>(null);
  const { busy, error, run } = useAsyncAction();

  // Any edit invalidates the last delivery count: it belonged to what was on
  // screen a moment ago, not to what is there now.
  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSent(null);
  };

  const send = () =>
    run(
      async () => {
        setSent(null);
        const { delivered } = await kromaClient().sendNotification({
          title: draft.title,
          body: draft.body,
          category: draft.category,
          link: draft.link || undefined,
          imageUrl: draft.imageUrl || undefined,
          target,
        });
        setSent(delivered);
      },
      (e) => (e instanceof Error ? e.message : t('error.serverBody')),
    );

  return (
    <Box row={{ base: false, lg: true }} align="flex-start" gap={16} mt={24}>
      <Surface elevated pad="none" radius="xl" px={22} py={20} gap={16} flex={1} minW={0}>
        <Field.Root label={t('admin.notifFieldTitle')}>
          <Field.Input
            icon="tag"
            value={draft.title}
            onValueChange={(v) => edit({ title: v })}
            placeholder={t('admin.notifTitlePlaceholder')}
          />
        </Field.Root>

        <Field.Root label={t('admin.notifFieldBody')}>
          <Field.Textarea
            rows={3}
            value={draft.body}
            onValueChange={(v) => edit({ body: v })}
            placeholder={t('admin.notifBodyPlaceholder')}
          />
        </Field.Root>

        <Row wrap gap={16}>
          <Field.Root label={t('admin.notifFieldCategory')} flex={1} minW={200}>
            <Select.Root
              label={t('admin.notifFieldCategory')}
              value={draft.category}
              onValueChange={(v) => edit({ category: v as Category })}
            >
              <Select.Trigger block />
              {(Object.keys(NOTIFICATION_CATEGORY_LABEL) as Category[]).map((c) => (
                <Select.Item key={c} value={c} label={t(NOTIFICATION_CATEGORY_LABEL[c])} />
              ))}
            </Select.Root>
          </Field.Root>
          <Field.Root label={t('admin.notifFieldLink')} flex={1} minW={200}>
            <Field.Input
              icon="link"
              value={draft.link}
              onValueChange={(v) => edit({ link: v })}
              placeholder="/movies/…"
            />
          </Field.Root>
        </Row>

        <NotificationImageField
          value={draft.imageUrl}
          onChange={(imageUrl) => edit({ imageUrl })}
        />
      </Surface>

      <Box w={{ base: '100%', lg: 384 }} shrink={0}>
        <Surface elevated pad="none" radius="xl" p={20} gap={16}>
          <Text variant="label">{t('admin.notifPreview')}</Text>
          <PreviewRow draft={draft} empty={t('admin.notifTitlePlaceholder')} />

          <Divider />

          <Box gap={10}>
            <Text variant="meta" color="textDim">
              {t('admin.notifTestTarget')}
            </Text>
            <ChoiceList.Root
              label={t('admin.notifTestTarget')}
              value={target}
              onValueChange={(next) => {
                setTarget(next as Target);
                setSent(null);
              }}
            >
              {TARGETS.map((o) => (
                <ChoiceList.Item key={o.value} value={o.value}>
                  <ChoiceList.Label>{t(o.label)}</ChoiceList.Label>
                  <ChoiceList.Hint>{t(o.hint)}</ChoiceList.Hint>
                </ChoiceList.Item>
              ))}
            </ChoiceList.Root>
          </Box>

          {/* Said before the press: "everyone" writes a row into every account
          on this server, and there is no unsend. */}
          {target === 'everyone' ? (
            <Row gap={10} align="flex-start" bg="accent/12" radius={10} px={12} py={10}>
              <Icon name="alert-triangle" size={16} color="accent" />
              <Text variant="meta" color="accent" style={NOTE}>
                {t('admin.notifTestEveryoneWarning')}
              </Text>
            </Row>
          ) : null}

          <Button
            variant="primary"
            icon="send"
            block
            label={busy ? t('common.loading') : t('admin.notifTestSend')}
            disabled={busy || !draft.title.trim()}
            onPress={() => void send()}
          />

          {sent !== null ? (
            <Text variant="meta" color={sent > 0 ? 'success' : 'textDim'} style={CENTRED}>
              {sent > 0 ? t('admin.notifTestSent', { n: sent }) : t('admin.notifTestMuted')}
            </Text>
          ) : null}
          {error ? (
            <Text variant="meta" color="danger" style={CENTRED}>
              {error}
            </Text>
          ) : null}

          <Text variant="meta" color="textDim">
            {t('admin.notifSendHint')}
          </Text>
        </Surface>
      </Box>
    </Box>
  );
}

const CENTRED = { textAlign: 'center' } as const;

// The composer's preview draws its own shell, where a drawer row takes its
// <ListRow.Root>'s.
const PREVIEW_CARD = {
  borderRadius: 16,
  background: color('surface2'),
  padding: 10,
  paddingLeft: 8,
} as const;
const NOTE = { flex: 1 } as const;

// The same tile, gutter and metrics the drawer uses, so the preview matches
// what recipients actually see; `custom` is the event type this bench always sends.
function PreviewRow({ draft, empty }: Readonly<{ draft: Draft; empty: string }>) {
  const t = useT();
  const art = draft.imageUrl ? kromaClient().resolveArt(draft.imageUrl) : null;
  return (
    <NotificationCard
      style={PREVIEW_CARD}
      event="custom"
      src={art}
      unread
      title={draft.title || empty}
      titleTone={draft.title ? 'text' : 'textDim'}
      body={draft.body || t('admin.notifBodyPlaceholder')}
      bodyTone={draft.body ? 'textMuted' : 'textDim'}
      time={t('notifications.justNow')}
    />
  );
}
