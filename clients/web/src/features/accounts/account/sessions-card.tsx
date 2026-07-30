import type { SessionInfo } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTv,
  IconLoader2,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Panel } from '#web/features/accounts/account/ui';
import { relativeSeen } from '#web/shared/lib/adminFormat';
import { kromaClient } from '#web/shared/lib/api';
import { type DeviceKind, deviceInfo } from '#web/shared/lib/device';
import { userQueries } from '#web/shared/lib/queries';
import { Button } from '#web/shared/ui';

const DEVICE_ICON: Record<DeviceKind, typeof IconDeviceDesktop> = {
  tv: IconDeviceTv,
  mobile: IconDeviceMobile,
  desktop: IconDeviceDesktop,
};

function SessionRow({ session }: Readonly<{ session: SessionInfo }>) {
  const t = useT();
  const qc = useQueryClient();
  const [revoking, setRevoking] = useState(false);
  const { label, kind } = deviceInfo(session.userAgent, t('account.unknownDevice'));
  const Icon = DEVICE_ICON[kind];

  const revoke = async () => {
    setRevoking(true);
    try {
      await kromaClient().revokeSession(session.id);
      await qc.invalidateQueries({ queryKey: ['sessions'] });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 px-5.5 py-3.5">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex size-9.5 flex-none items-center justify-center rounded-md border border-border bg-surface-2 text-muted">
          <Icon size={19} stroke={1.7} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 text-[14px] font-bold text-text">
            <span className="truncate">{label}</span>
            {session.current ? (
              <span className="flex-none rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">
                {t('account.thisDevice')}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-muted">
            {relativeSeen(session.lastSeen)}
          </div>
        </div>
      </div>
      {session.current ? (
        <span className="flex-none text-[12.5px] font-semibold text-dim">
          {t('account.sessionActive')}
        </span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          label={revoking ? t('common.saving') : t('account.signOutDevice')}
          onPress={revoke}
          loading={revoking}
        />
      )}
    </div>
  );
}

export function SessionsCard() {
  const t = useT();
  const { data: sessions, isPending } = useQuery(userQueries.sessions());

  return (
    <Panel className="divide-y divide-border/70 overflow-hidden">
      <div className="px-5.5 py-4 text-[14.5px] font-bold text-text">{t('account.sessions')}</div>
      <SessionsBody isPending={isPending} sessions={sessions} />
    </Panel>
  );
}

function SessionsBody({
  isPending,
  sessions,
}: Readonly<{ isPending: boolean; sessions: SessionInfo[] | undefined }>) {
  const t = useT();
  if (isPending)
    return (
      <div className="flex items-center gap-2.5 px-5.5 py-5 text-[13px] text-muted">
        <IconLoader2 size={16} className="animate-spin" />
        {t('common.loading')}
      </div>
    );
  if (!sessions || sessions.length === 0)
    return <div className="px-5.5 py-5 text-[13px] text-muted">{t('account.sessionsEmpty')}</div>;
  return (
    <>
      {sessions.map((s) => (
        <SessionRow key={s.id} session={s} />
      ))}
    </>
  );
}
