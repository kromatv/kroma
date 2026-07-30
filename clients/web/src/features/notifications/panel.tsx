// The notification centre: a bell with an unread badge, opening a drawer of
// notifications. A row is a whole card — the card itself is the only control:
// opening it marks it read and follows its link. There are no per-row buttons;
// a notification with Approve/Deny sends you to the queue those decisions
// belong to, so the drawer stays a list of what happened, not a console.

import {
  groupNotificationsByDay,
  type KNOWN_NOTIFICATION_EVENTS,
  NOTIFICATION_DAY_LABEL,
  type Notification,
  type NotificationEvent,
  sizedImageUrl,
} from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import * as Dialog from '@radix-ui/react-dialog';
import {
  IconAlertTriangle,
  IconBell,
  IconBellRinging,
  IconChecks,
  IconCircleCheck,
  IconCircleMinus,
  IconCircleX,
  IconDatabase,
  IconDeviceTv,
  IconDownload,
  IconFlag3,
  IconInbox,
  IconLoader2,
  IconPlayerPlayFilled,
  IconPlugConnectedX,
  IconServerBolt,
  IconSparkles,
  IconX,
  type TablerIcon,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useId, useState } from 'react';
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
          className={`relative flex h-10 w-10 items-center justify-center rounded-[11px] text-muted transition-colors hover:bg-white/6 hover:text-text data-[state=open]:bg-white/8 data-[state=open]:text-text ${className ?? ''}`}
        >
          <IconBell size={20} />
          {unread > 0 && (
            <span
              // Caps at 9+ so the badge doesn't outgrow the bell.
              className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-[18px] tabular-nums text-accent-ink ring-2 ring-[#0C0C0E]"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[6px] data-[state=open]:animate-[fade-in_.22s_var(--ease-out)]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-[#101014] outline-none data-[state=open]:animate-[slide-in-right_.3s_var(--ease-out)] sm:w-[min(25rem,92vw)] sm:border-l sm:border-white/8"
        >
          <PanelHeader onClose={() => setOpen(false)} />
          {/* Mounted on first open and kept mounted after, so reopening doesn't refetch. */}
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
    <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 pb-3 pt-[max(1.15rem,env(safe-area-inset-top))]">
      <Dialog.Title className="text-[16px] font-semibold text-text">
        {t('notifications.title')}
      </Dialog.Title>
      <div className="ml-auto flex items-center gap-0.5">
        {/* Icon-only: the label is long in every language and crowded the title. */}
        <IconAction
          icon={IconChecks}
          label={t('notifications.markAllRead')}
          onClick={() => void markAll()}
          disabled={unread === 0}
          busy={busy}
        />
        <IconAction icon={IconX} label={t('common.close')} onClick={onClose} />
      </div>
    </div>
  );
}

function IconAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  busy,
}: Readonly<{
  icon: TablerIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled === true || busy === true}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/6 hover:text-text disabled:pointer-events-none disabled:opacity-30"
    >
      {busy === true ? <IconLoader2 size={17} className="animate-spin" /> : <Icon size={18} />}
    </button>
  );
}

function PanelBody({ onNavigate }: Readonly<{ onNavigate: () => void }>) {
  const t = useT();
  const { data, isPending } = useQuery(userQueries.notifications());

  if (isPending) {
    return (
      <div className="flex-1 px-2 pt-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex animate-pulse gap-3 p-2.5 pl-4">
            <div className="h-12 w-12 shrink-0 rounded-xl bg-white/6" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 w-2/5 rounded-full bg-white/6" />
              <div className="h-2.5 w-4/5 rounded-full bg-white/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const items = data?.notifications ?? [];
  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-10 pb-12 text-center">
        <IconBell size={26} stroke={1.6} className="mb-1 text-dim" />
        <p className="text-[14px] font-semibold text-text">{t('notifications.empty')}</p>
        <p className="max-w-[16rem] text-[12.5px] leading-relaxed text-dim">
          {t('notifications.emptyHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-3 [scrollbar-color:rgba(255,255,255,0.16)_transparent] [scrollbar-width:thin]">
      {groupNotificationsByDay(items).map((group) => (
        // Keyed on the run's first row, not the day: an unsorted inbox can open a
        // second "Earlier" run, and two sections must not share a key.
        <section key={group.items[0]?.id}>
          {/* h3, not h2: Radix renders <Dialog.Title> as the h2. */}
          <h3 className="sticky top-0 z-10 bg-[#101014] px-2 pb-1.5 pt-3 text-[11px] font-semibold text-dim">
            {t(NOTIFICATION_DAY_LABEL[group.day])}
          </h3>
          <ul>
            {group.items.map((n) => (
              <li key={n.id}>
                <NotificationRow notification={n} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NotificationRow({
  notification,
  onNavigate,
}: Readonly<{ notification: Notification; onNavigate: () => void }>) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const labelId = useId();

  // Navigation doesn't wait on the read-write — a receipt isn't worth a frame
  // of dead click.
  function open() {
    if (!notification.read) {
      void kromaClient()
        .markNotificationsRead([notification.id])
        .then(() =>
          queryClient.invalidateQueries({ queryKey: userQueries.notifications().queryKey }),
        )
        .catch(() => undefined);
    }
    const to = destinationOf(notification);
    if (to) {
      onNavigate();
      void navigate({ to });
    }
  }

  const unread = !notification.read;
  return (
    <div className="relative rounded-xl transition-colors hover:bg-white/[0.04]">
      {/* One hit target for the whole card, laid under the content. */}
      <button
        type="button"
        onClick={open}
        aria-labelledby={`${labelId}-title ${labelId}-body`}
        className="absolute inset-0 rounded-xl"
      />
      <NotificationCard
        className="pointer-events-none relative"
        event={notification.event}
        src={notification.imageUrl ? sizedImageUrl(notification.imageUrl, 96) : null}
        unread={unread}
        title={notification.title}
        titleTone={unread ? 'text-text' : 'text-text/70'}
        titleId={`${labelId}-title`}
        body={notification.body}
        bodyId={`${labelId}-body`}
        time={
          <time dateTime={new Date(notification.createdAt).toISOString()} className="tabular-nums">
            <RelativeTime at={notification.createdAt} />
          </time>
        }
      />
    </div>
  );
}

/** A notification row's contents: gutter, tile, title/time line, clamped body.
 * Exported so the admin composer's preview renders the real row markup rather
 * than a hand-copied approximation; the caller supplies the shell and tones. */
export function NotificationCard({
  className = '',
  event,
  src,
  unread,
  title,
  titleTone = 'text-text',
  titleId,
  body,
  bodyTone = 'text-muted',
  bodyId,
  time,
}: Readonly<{
  className?: string;
  event: NotificationEvent;
  src: string | null;
  unread: boolean;
  title: ReactNode;
  titleTone?: string;
  titleId?: string;
  body: ReactNode;
  bodyTone?: string;
  bodyId?: string;
  time: ReactNode;
}>) {
  return (
    <div className={`flex items-start p-2.5 pl-2 ${className}`}>
      {/* The gutter is reserved on every row, empty or not, so nothing shifts. */}
      <span className="mr-2 flex h-12 w-1.5 shrink-0 items-center">
        {unread && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
      </span>
      <NotificationTile event={event} src={src} className="mr-3" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p
            id={titleId}
            className={`min-w-0 flex-1 truncate text-[13.5px] font-semibold leading-5 ${titleTone}`}
          >
            {title}
          </p>
          <span className="shrink-0 pt-[3px] text-[11px] text-dim">{time}</span>
        </div>
        <p id={bodyId} className={`mt-0.5 line-clamp-2 text-[12.5px] leading-[1.45] ${bodyTone}`}>
          {body}
        </p>
      </div>
    </div>
  );
}

function NotificationGlyph({
  event,
  size = 20,
}: Readonly<{ event: NotificationEvent; size?: number }>) {
  const meta = eventMeta(event);
  return <meta.icon size={size} stroke={1.8} className={meta.fg} />;
}

/** The 48px leading tile: artwork when the notification carries some, else the
 * event glyph on a neutral plate (kept neutral so the glyph's colour is the
 * signal). `src` arrives already resolved by the caller. */
export function NotificationTile({
  event,
  src,
  className = '',
}: Readonly<{ event: NotificationEvent; src?: string | null; className?: string }>) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className={`h-12 w-12 shrink-0 rounded-xl object-cover ${className}`}
      />
    );
  }
  return (
    <span
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/6 ${className}`}
    >
      <NotificationGlyph event={event} />
    </span>
  );
}

// The notification's own `link`, else its first `link`-kind action. `api`
// actions (Approve, Deny) have no destination — deliberately not offered here,
// since their notification links to the queue where the decision belongs.
function destinationOf(notification: Notification): string | undefined {
  if (notification.link) return notification.link;
  return notification.actions.find((a) => a.kind === 'link')?.href;
}

interface EventMeta {
  icon: TablerIcon;
  fg: string;
}

// Keyed on the KNOWN list, not on `NotificationEvent` (an open union a newer
// server may extend): a known event missing an entry is a type error, an
// unknown one just falls back.
const EVENT_META: Record<(typeof KNOWN_NOTIFICATION_EVENTS)[number], EventMeta> = {
  'request.submitted': { icon: IconInbox, fg: 'text-accent' },
  'request.approved': { icon: IconCircleCheck, fg: 'text-success' },
  'request.denied': { icon: IconCircleX, fg: 'text-red-400' },
  'request.available': { icon: IconSparkles, fg: 'text-accent' },
  'media.added': { icon: IconPlayerPlayFilled, fg: 'text-info' },
  'media.episode': { icon: IconDeviceTv, fg: 'text-info' },
  'report.submitted': { icon: IconFlag3, fg: 'text-hdr' },
  'report.resolved': { icon: IconCircleCheck, fg: 'text-success' },
  'report.dismissed': { icon: IconCircleMinus, fg: 'text-muted' },
  'download.imported': { icon: IconDownload, fg: 'text-h265' },
  'download.failed': { icon: IconAlertTriangle, fg: 'text-red-400' },
  'system.job.failed': { icon: IconServerBolt, fg: 'text-red-400' },
  'system.vpn.down': { icon: IconPlugConnectedX, fg: 'text-red-400' },
  'system.disk.low': { icon: IconDatabase, fg: 'text-accent' },
  'system.test': { icon: IconBellRinging, fg: 'text-accent' },
  // A module's own event has no vocabulary this app can read, so it stays neutral.
  custom: { icon: IconSparkles, fg: 'text-muted' },
};

const FALLBACK_META: EventMeta = { icon: IconBell, fg: 'text-muted' };

function eventMeta(event: NotificationEvent): EventMeta {
  return (EVENT_META as Record<string, EventMeta | undefined>)[event] ?? FALLBACK_META;
}

// `Intl.RelativeTimeFormat` renders the zero case as the CURRENT unit rather
// than an elapsed one ("this minute"), so it's special-cased to "just now".
// `short` style is used over `narrow`, which renders French as "-47 min".
function RelativeTime({ at }: Readonly<{ at: number }>) {
  const t = useT();
  const locale = useLocale();
  const mins = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (mins < 1) return <>{t('notifications.justNow')}</>;
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (mins < 60) return <>{fmt.format(-mins, 'minute')}</>;
  const hours = Math.round(mins / 60);
  if (hours < 24) return <>{fmt.format(-hours, 'hour')}</>;
  const days = Math.round(hours / 24);
  if (days < 7) return <>{fmt.format(-days, 'day')}</>;
  return <>{new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(at)}</>;
}
