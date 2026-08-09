// What one notification looks like, wherever it is shown: the drawer's rows
// and the admin bench's preview are the same card, so what an author sees
// before sending is what recipients get.

import type { KNOWN_NOTIFICATION_EVENTS, NotificationEvent } from '@kroma/core';
import {
  IconAlertTriangle,
  IconBell,
  IconBellRinging,
  IconCircleCheck,
  IconCircleMinus,
  IconCircleX,
  IconDatabase,
  IconDeviceTv,
  IconDownload,
  IconFlag3,
  IconInbox,
  IconPlayerPlayFilled,
  IconServerBolt,
  IconSparkles,
  type TablerIcon,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';

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

function NotificationGlyph({
  event,
  size = 20,
}: Readonly<{ event: NotificationEvent; size?: number }>) {
  const meta = eventMeta(event);
  return <meta.icon size={size} stroke={1.8} className={meta.fg} />;
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
  'system.disk.low': { icon: IconDatabase, fg: 'text-accent' },
  'system.test': { icon: IconBellRinging, fg: 'text-accent' },
  // A module's own event has no vocabulary this app can read, so it stays neutral.
  custom: { icon: IconSparkles, fg: 'text-muted' },
};

const FALLBACK_META: EventMeta = { icon: IconBell, fg: 'text-muted' };

function eventMeta(event: NotificationEvent): EventMeta {
  return (EVENT_META as Record<string, EventMeta | undefined>)[event] ?? FALLBACK_META;
}
