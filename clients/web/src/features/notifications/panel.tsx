// The notification centre: a bell with an unread badge, opening a drawer of
// notifications. A row is a whole card — the card itself is the only control:
// opening it marks it read and follows its link. There are no per-row buttons;
// a notification with Approve/Deny sends you to the queue those decisions
// belong to, so the drawer stays a list of what happened, not a console.

import {
  groupNotificationsByDay,
  NOTIFICATION_DAY_LABEL,
  type Notification,
  sizedImageUrl,
} from '@kroma/core';
import { useLocale, useT } from '@kroma/ui';
import { color, Drawer, EmptyState, ListRow } from '@kroma/ui/kit';
import { IconBell, IconChecks, IconLoader2, IconX, type TablerIcon } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { usePanelState, useUnreadCount } from '#web/features/notifications/use-notifications';
import { kromaClient } from '#web/shared/lib/api';
import { userQueries } from '#web/shared/lib/queries';
import { NotificationCard } from '#web/shared/ui/notification-card';

/** Bell + badge + drawer. Mounted in the sidebar (desktop) and topbar (mobile). */
export function NotificationBell({ className }: Readonly<{ className?: string }>) {
  const t = useT();
  const unread = useUnreadCount();
  const { open, setOpen, everOpened } = usePanelState();

  return (
    <>
      <button
        type="button"
        aria-label={
          unread > 0 ? `${t('notifications.title')} (${unread})` : t('notifications.title')
        }
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`relative flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/6 hover:text-text ${open ? 'bg-white/8 text-text' : ''} ${className ?? ''}`}
      >
        <IconBell size={20} />
        {unread > 0 && (
          <span
            // Caps at 9+ so the badge doesn't outgrow the bell.
            className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-[18px] tabular-nums text-accent-ink ring-2 ring-bg"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t('notifications.title')}
        width={400}
        fullBelow={640}
        panelStyle={PANEL_FILL}
      >
        <PanelHeader onClose={() => setOpen(false)} />
        {/* Mounted on first open and kept mounted after, so reopening doesn't refetch. */}
        {everOpened ? <PanelBody onNavigate={() => setOpen(false)} /> : null}
      </Drawer>
    </>
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
      <h2 className="text-[16px] font-semibold text-text">{t('notifications.title')}</h2>
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

const PANEL_FILL = { backgroundColor: color('bg') } as const;

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
      <EmptyState.Root
        size="sm"
        layout="fill"
        icon="bell"
        title={t('notifications.empty')}
        hint={t('notifications.emptyHint')}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-3 [scrollbar-color:rgba(255,255,255,0.16)_transparent] [scrollbar-width:thin]">
      {groupNotificationsByDay(items).map((group) => (
        // Keyed on the run's first row, not the day: an unsorted inbox can open a
        // second "Earlier" run, and two sections must not share a key.
        <section key={group.items[0]?.id}>
          {/* h3, not h2: the panel header renders the h2. */}
          <h3 className="sticky top-0 z-10 bg-bg px-2 pb-1.5 pt-3 text-[11px] font-semibold text-dim">
            {t(NOTIFICATION_DAY_LABEL[group.day])}
          </h3>
          <ListRow.Group size="sm">
            {group.items.map((n) => (
              <NotificationRow key={n.id} notification={n} onNavigate={onNavigate} />
            ))}
          </ListRow.Group>
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
    <ListRow.Root
      size="sm"
      label={notification.title}
      onPress={open}
      chevron={false}
      style={ROW_PAD}
    >
      <NotificationCard
        event={notification.event}
        src={notification.imageUrl ? sizedImageUrl(notification.imageUrl, 96) : null}
        unread={unread}
        title={notification.title}
        titleTone={unread ? 'text-text' : 'text-text/70'}
        body={notification.body}
        time={
          <time dateTime={new Date(notification.createdAt).toISOString()} className="tabular-nums">
            <RelativeTime at={notification.createdAt} />
          </time>
        }
      />
    </ListRow.Root>
  );
}

// The card draws its own gutter, so the row's leading inset is the gutter's.
const ROW_PAD = { paddingLeft: 8 } as const;

/** A notification row's contents: gutter, tile, title/time line, clamped body.
 * Exported so the admin composer's preview renders the real row markup rather
 * than a hand-copied approximation; the caller supplies the shell and tones. */
// The notification's own `link`, else its first `link`-kind action. `api`
// actions (Approve, Deny) have no destination — deliberately not offered here,
// since their notification links to the queue where the decision belongs.
function destinationOf(notification: Notification): string | undefined {
  if (notification.link) return notification.link;
  return notification.actions.find((a) => a.kind === 'link')?.href;
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
