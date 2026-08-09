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
  Divider,
  Field,
  Icon,
  Row,
  Select,
  Surface,
  Txt,
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
    <div className="mt-6 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Surface elevated pad="none" radius={16} px={22} py={20} gap={16} minW={0}>
        <Field
          icon="tag"
          label={t('admin.notifFieldTitle')}
          value={draft.title}
          onChange={(v) => edit({ title: v })}
          placeholder={t('admin.notifTitlePlaceholder')}
        />

        <Field
          label={t('admin.notifFieldBody')}
          multiline
          rows={3}
          value={draft.body}
          onChange={(v) => edit({ body: v })}
          placeholder={t('admin.notifBodyPlaceholder')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('admin.notifFieldCategory')} minW={0}>
            <Select
              block
              label={t('admin.notifFieldCategory')}
              value={draft.category}
              onChange={(v) => edit({ category: v as Category })}
              options={(Object.keys(NOTIFICATION_CATEGORY_LABEL) as Category[]).map((c) => ({
                value: c,
                label: t(NOTIFICATION_CATEGORY_LABEL[c]),
              }))}
            />
          </Field>
          <Field
            icon="link"
            label={t('admin.notifFieldLink')}
            value={draft.link}
            onChange={(v) => edit({ link: v })}
            placeholder="/movie/…"
            minW={0}
          />
        </div>

        <NotificationImageField
          value={draft.imageUrl}
          onChange={(imageUrl) => edit({ imageUrl })}
        />
      </Surface>

      <div className="xl:sticky xl:top-5">
        <Surface elevated pad="none" radius={16} p={20} gap={16}>
          <Txt variant="label">{t('admin.notifPreview')}</Txt>
          <PreviewRow draft={draft} empty={t('admin.notifTitlePlaceholder')} />

          <Divider />

          <Box gap={10}>
            <Txt variant="meta" color="textDim">
              {t('admin.notifTestTarget')}
            </Txt>
            <ChoiceList.Root
              label={t('admin.notifTestTarget')}
              value={target}
              onValueChange={(next) => {
                setTarget(next as Target);
                setSent(null);
              }}
            >
              {TARGETS.map((o) => (
                <ChoiceList.Item
                  key={o.value}
                  value={o.value}
                  label={t(o.label)}
                  hint={t(o.hint)}
                />
              ))}
            </ChoiceList.Root>
          </Box>

          {/* Said before the press: "everyone" writes a row into every account
              on this server, and there is no unsend. */}
          {target === 'everyone' ? (
            <Row gap={10} align="flex-start" bg="accent/12" radius={10} px={12} py={10}>
              <Icon name="alert-triangle" size={16} color="accent" />
              <Txt variant="meta" color="accent" style={NOTE}>
                {t('admin.notifTestEveryoneWarning')}
              </Txt>
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
            <Txt variant="meta" color={sent > 0 ? 'success' : 'textDim'} style={CENTRED}>
              {sent > 0 ? t('admin.notifTestSent', { n: sent }) : t('admin.notifTestMuted')}
            </Txt>
          ) : null}
          {error ? (
            <Txt variant="meta" color="danger" style={CENTRED}>
              {error}
            </Txt>
          ) : null}

          <Txt variant="meta" color="textDim">
            {t('admin.notifSendHint')}
          </Txt>
        </Surface>
      </div>
    </div>
  );
}

const CENTRED = { textAlign: 'center' } as const;
const NOTE = { flex: 1 } as const;

// The same tile, gutter and metrics the drawer uses, so the preview matches
// what recipients actually see; `custom` is the event type this bench always sends.
function PreviewRow({ draft, empty }: Readonly<{ draft: Draft; empty: string }>) {
  const t = useT();
  const art = draft.imageUrl ? kromaClient().resolveArt(draft.imageUrl) : null;
  return (
    <NotificationCard
      className="rounded-xl bg-surface-2"
      event="custom"
      src={art}
      unread
      title={draft.title || empty}
      titleTone={draft.title ? 'text-text' : 'text-dim'}
      body={draft.body || t('admin.notifBodyPlaceholder')}
      bodyTone={draft.body ? 'text-muted' : 'text-dim'}
      time={t('notifications.justNow')}
    />
  );
}
