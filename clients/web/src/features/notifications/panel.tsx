// The notification centre: a bell with an unread badge, opening a drawer of
// notifications.
//
// A row is a whole little card — poster, title, body, relative time — and is
// itself the primary action (tapping it opens `link`). Action buttons sit below:
// `link` actions navigate, `api` actions (Approve / Deny) call the server from
// the row itself, so a moderator never has to open the console to clear a queue.

import { type Notification, sizedImageUrl } from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { IconBell, IconCheck, IconX } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { usePanelState, useUnreadCount } from '#web/features/notifications/use-notifications';
import { kromaClient } from '#web/shared/lib/api';
import { userQueries } from '#web/shared/lib/queries';

/** Bell + badge + drawer. Mounted in the sidebar (desktop) and topbar (mobile). */
export function NotificationBell({ className }: Readonly<{ className?: string }>) {
  const t = useT();
  const unread = useUnreadCount();
  const { open, setOpen, everOpened } = usePanelState();

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={
            unread > 0 ? `${t('notifications.title')} (${unread})` : t('notifications.title')
          }
          className={`relative flex h-10 w-10 items-center justify-center rounded-[11px] text-muted transition-colors hover:bg-white/4 hover:text-text ${className ?? ''}`}
        >
          <IconBell size={20} />
          {unread > 0 && (
            <span
              // Count to 9+: past that the exact number stops being useful and
              // the dot would outgrow the bell.
              className="absolute right-1 top-1 min-w-[17px] rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-[17px] text-black"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[6px] data-[state=open]:animate-[fade-in_.2s_ease]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-border bg-surface-1 outline-none data-[state=open]:animate-[fade-in_.2s_var(--ease-out)] sm:w-[min(26rem,90vw)] sm:border-l"
        >
          <PanelHeader onClose={() => setOpen(false)} />
          {everOpened ? <PanelBody onNavigate={() => setOpen(false)} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PanelHeader({ onClose }: Readonly<{ onClose: () => void }>) {
  const t = useT();
  const queryClient = useQueryClient();
  const unread = useUnreadCount();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    try {
      await kromaClient().markAllNotificationsRead();
      await queryClient.invalidateQueries({ queryKey: userQueries.notifications().queryKey });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Dialog.Title className="text-[15px] font-semibold text-text">
        {t('notifications.title')}
      </Dialog.Title>
      <div className="flex items-center gap-1">
        {unread > 0 && (
          <button
            type="button"
            onClick={markAll}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-[12px] text-muted transition-colors hover:bg-white/4 hover:text-text disabled:opacity-50"
          >
            {t('notifications.markAllRead')}
          </button>
        )}
        <Dialog.Close asChild>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/4 hover:text-text"
          >
            <IconX size={18} />
          </button>
        </Dialog.Close>
      </div>
    </div>
  );
}

function PanelBody({ onNavigate }: Readonly<{ onNavigate: () => void }>) {
  const t = useT();
  const { data, isPending } = useQuery(userQueries.notifications());

  if (isPending) {
    return (
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[76px] animate-pulse rounded-xl bg-white/4" />
        ))}
      </div>
    );
  }
  if (!data?.notifications.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
        <IconBell size={28} className="text-muted/50" />
        <p className="text-[14px] font-medium text-text">{t('notifications.empty')}</p>
        <p className="text-[12px] text-muted">{t('notifications.emptyHint')}</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {data.notifications.map((n) => (
        <NotificationRow key={n.id} notification={n} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

function NotificationRow({
  notification,
  onNavigate,
}: Readonly<{ notification: Notification; onNavigate: () => void }>) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: userQueries.notifications().queryKey });

  /** Opening a notification marks it read — that is what "seen" means here. */
  async function open() {
    if (!notification.read) {
      await kromaClient().markNotificationsRead([notification.id]);
      void refresh();
    }
    if (notification.link) {
      onNavigate();
      void navigate({ to: notification.link });
    }
  }

  async function runAction(action: Notification['actions'][number]) {
    if (action.kind === 'link') {
      onNavigate();
      void navigate({ to: action.href });
      return;
    }
    setBusy(action.id);
    try {
      await kromaClient().runNotificationAction(action);
      // The decision is made; show it on the row instead of making the user
      // hunt for whether it worked.
      setDone(true);
      await kromaClient().markNotificationsRead([notification.id]);
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  const poster = notification.imageUrl ? sizedImageUrl(notification.imageUrl, 96) : null;

  return (
    <div
      className={`group rounded-xl p-2 transition-colors ${notification.read ? '' : 'bg-white/[0.03]'}`}
    >
      <button
        type="button"
        onClick={open}
        className="flex w-full items-start gap-3 text-left"
        disabled={done}
      >
        {poster ? (
          <img
            src={poster}
            alt=""
            loading="lazy"
            className="h-16 w-11 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span className="flex h-16 w-11 shrink-0 items-center justify-center rounded-md bg-white/5">
            <IconBell size={16} className="text-muted" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {!notification.read && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            )}
            <span className="truncate text-[13px] font-semibold text-text">
              {notification.title}
            </span>
          </span>
          <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-muted">
            {notification.body}
          </span>
          <span className="mt-1 block text-[11px] text-muted/70">
            <RelativeTime at={notification.createdAt} />
          </span>
        </span>
      </button>
      {notification.actions.length > 0 && !done && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 pl-14">
          {notification.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => runAction(action)}
              disabled={busy !== null}
              className={actionCls(action.style)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      {done && (
        <p className="mt-1.5 flex items-center gap-1 pl-14 text-[11px] text-muted">
          <IconCheck size={13} />
          {t('common.done')}
        </p>
      )}
    </div>
  );
}

function actionCls(style: Notification['actions'][number]['style']): string {
  const base =
    'rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-50';
  if (style === 'primary') return `${base} bg-accent text-black hover:bg-accent/90`;
  if (style === 'danger') return `${base} bg-red-500/15 text-red-300 hover:bg-red-500/25`;
  return `${base} bg-white/6 text-text hover:bg-white/10`;
}

/** Coarse relative time — a notification list needs "5 min ago", not seconds.
 *
 * Uses `Intl.RelativeTimeFormat`, which localizes itself from the active locale,
 * so this needs no catalog keys and stays correct for any language added later. */
function RelativeTime({ at }: Readonly<{ at: number }>) {
  const locale = useLocale();
  const mins = Math.max(0, Math.round((Date.now() - at) / 60_000));
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
  if (mins < 60) return <>{fmt.format(-mins, 'minute')}</>;
  const hours = Math.round(mins / 60);
  if (hours < 24) return <>{fmt.format(-hours, 'hour')}</>;
  return <>{fmt.format(-Math.round(hours / 24), 'day')}</>;
}
