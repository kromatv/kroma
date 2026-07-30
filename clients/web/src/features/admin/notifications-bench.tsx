// Sending a notification from the console. There is no test/dry-run mode: send
// goes through the same pipeline as a producer's notification (category
// preferences, per-recipient rendering, the stored row, the live bell, the push
// fan-out), so "everyone" reaches every account for real.

import { Card, Field, OptionSelect, TextArea, TextInput, useAsyncAction } from '@kroma/admin-kit';
import type { MessageKey, Notification } from '@kroma/core';
import { NOTIFICATION_CATEGORY_LABEL } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button } from '@kroma/ui/kit';
import { useRef, useState } from 'react';
import { NotificationCard } from '#web/features/notifications/panel';
import { kromaClient } from '#web/shared/lib/api';

type Target = 'me' | 'admins' | 'everyone';
type Category = Notification['category'];

const TARGETS: { value: Target; label: MessageKey }[] = [
  { value: 'me', label: 'admin.notifTargetMe' },
  { value: 'admins', label: 'admin.notifTargetAdmins' },
  { value: 'everyone', label: 'admin.notifTargetEveryone' },
];

/** What the form holds — and, one to one, what the server is asked to send. */
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
  const fileRef = useRef<HTMLInputElement>(null);

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

  const upload = (file: File) =>
    run(
      async () => {
        const { imageUrl } = await kromaClient().uploadNotificationImage(file);
        edit({ imageUrl });
      },
      (e) => (e instanceof Error ? e.message : t('error.serverBody')),
    );

  return (
    // Capped width: a five-field form shouldn't stretch full-bleed on a wide display.
    <div className="mt-6 grid max-w-[58rem] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <Card className="min-w-0 px-5.5 pb-1.5 pt-5">
        <Field label={t('admin.notifFieldTitle')}>
          <TextInput
            className="w-full"
            value={draft.title}
            onChange={(v) => edit({ title: v })}
            placeholder={t('admin.notifTitlePlaceholder')}
          />
        </Field>

        <Field label={t('admin.notifFieldBody')}>
          <TextArea
            className="w-full"
            value={draft.body}
            onChange={(v) => edit({ body: v })}
            rows={3}
            placeholder={t('admin.notifBodyPlaceholder')}
          />
        </Field>

        <div className="grid gap-x-3.5 sm:grid-cols-2">
          <Field label={t('admin.notifFieldCategory')}>
            <OptionSelect
              block
              value={draft.category}
              onChange={(v) => edit({ category: v as Category })}
              ariaLabel={t('admin.notifFieldCategory')}
              options={(Object.keys(NOTIFICATION_CATEGORY_LABEL) as Category[]).map((c) => ({
                value: c,
                label: t(NOTIFICATION_CATEGORY_LABEL[c]),
              }))}
            />
          </Field>
          <Field label={t('admin.notifFieldLink')}>
            <TextInput
              className="w-full"
              value={draft.link}
              onChange={(v) => edit({ link: v })}
              placeholder="/movie/…"
            />
          </Field>
        </div>

        <Field label={t('admin.notifFieldImage')}>
          {/* Upload or paste a path: covers a new image and reusing an existing poster. */}
          <div className="flex items-center gap-2">
            <TextInput
              className="w-full flex-1"
              value={draft.imageUrl}
              onChange={(v) => edit({ imageUrl: v })}
              placeholder="/api/images/…"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                if (fileRef.current) fileRef.current.value = '';
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              icon="photo"
              label={t('admin.notifUpload')}
              disabled={busy}
              onPress={() => fileRef.current?.click()}
            />
            {draft.imageUrl ? (
              <Button
                variant="ghost"
                size="sm"
                icon="trash"
                label={t('common.delete')}
                onPress={() => edit({ imageUrl: '' })}
              />
            ) : null}
          </div>
        </Field>
      </Card>

      <Card className="px-5 py-5 lg:sticky lg:top-5">
        <h2 className="mb-4 text-[14px] font-semibold text-text">{t('admin.notifPreview')}</h2>
        <PreviewRow draft={draft} empty={t('admin.notifTitlePlaceholder')} />

        <div className="mt-5 border-t border-border pt-4">
          {/* Real radios, not styled buttons: native arrow-key nav and screen-reader
              grouping. The row carries the focus ring the app blanks on form controls. */}
          <fieldset>
            <legend className="mb-2 text-[12px] font-semibold text-dim">
              {t('admin.notifTestTarget')}
            </legend>
            <div className="flex flex-col">
              {TARGETS.map((o) => (
                <label
                  key={o.value}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-accent/50 ${
                    target === o.value
                      ? 'text-accent'
                      : 'text-muted hover:bg-white/4 hover:text-text'
                  }`}
                >
                  <input
                    type="radio"
                    name="notif-target"
                    value={o.value}
                    checked={target === o.value}
                    onChange={() => {
                      setTarget(o.value);
                      setSent(null);
                    }}
                    className="h-3.5 w-3.5 shrink-0 accent-accent"
                  />
                  {t(o.label)}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Said before the press: "everyone" writes a row into every account
              on this server, and there is no unsend. */}
          {target === 'everyone' ? (
            <p className="mt-2 px-2.5 text-[12px] leading-relaxed text-accent">
              {t('admin.notifTestEveryoneWarning')}
            </p>
          ) : null}

          <div className="mt-4">
            <Button
              variant="primary"
              size="sm"
              icon="send"
              block
              label={busy ? t('common.loading') : t('admin.notifTestSend')}
              disabled={busy || !draft.title.trim()}
              onPress={() => void send()}
            />
          </div>

          {sent !== null ? (
            <p
              className={`mt-2.5 text-center text-[12.5px] font-semibold ${sent > 0 ? 'text-success' : 'text-dim'}`}
            >
              {sent > 0 ? t('admin.notifTestSent', { n: sent }) : t('admin.notifTestMuted')}
            </p>
          ) : null}
          {error ? (
            <p className="mt-2.5 text-center text-[12.5px] font-semibold text-danger">{error}</p>
          ) : null}

          <p className="mt-3.5 text-[11.5px] leading-relaxed text-dim">
            {t('admin.notifSendHint')}
          </p>
        </div>
      </Card>
    </div>
  );
}

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
