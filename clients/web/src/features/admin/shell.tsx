import { KromaEvents } from '@kroma/core';
import { AdminHostProvider, ModuleSlotProvider } from '@kroma/module-sdk';
import { Box, useBreakpoint } from '@kroma/ui/kit';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useMemo } from 'react';
import { ScrollView } from 'react-native';
import { usePoll } from '#web/features/admin/hooks';
import { AdminModalHosts } from '#web/features/admin/modal-hosts';
import { AdminContext } from '#web/features/admin/shell-context';
import { AdminMobileTopbar, AdminSidebar } from '#web/features/admin/shell-sidebar';
import { ADMIN_SCROLLER, ADMIN_SCROLLER_CONTENT } from '#web/features/admin/web-style';
import { moduleRegistry } from '#web/modules/registry';
import { apiBase } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { PageFrame } from '#web/shared/ui';
import { MediaInfoModal } from '#web/shared/ui/media-info-modal';

export { PageHeader } from '@kroma/ui/kit';
export { Denied, isAnyAdmin, useAsyncAction, useCap, usePoll } from '#web/features/admin/hooks';
export { useAdmin } from '#web/features/admin/shell-context';

export function AdminProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { client, user } = useAuth();
  const queryClient = useQueryClient();
  const kit = useMemo(
    () => ({
      client,
      user,
      apiBase: apiBase(),
      openMediaInfo: (id: string, title: string) => {
        void MediaInfoModal.call({ id, title });
      },
    }),
    [client, user],
  );
  const { data: serverInfo } = usePoll(['admin', 'server'], () => client.adminServer(), 15000);

  // Coalesce to one refresh per window, since e.g. an enrich pass emits one
  // item.updated per title. Compared as plain strings: download.progress is a
  // module's frame, not part of core's union.
  useEffect(() => {
    const highFrequency = new Set([
      'job.log',
      'job.progress',
      'download.progress',
      'module.op.progress',
      'module.op.done',
    ]);
    let pending: ReturnType<typeof setTimeout> | null = null;
    const ev = new KromaEvents(apiBase(), {
      onEvent: (e) => {
        if (highFrequency.has(e.type)) return;
        if (pending) return;
        pending = setTimeout(() => {
          pending = null;
          void queryClient.invalidateQueries({ queryKey: ['admin'] });
        }, 1500);
      },
    });
    ev.connect();
    return () => {
      if (pending) clearTimeout(pending);
      ev.close();
    };
  }, [queryClient]);

  const adminValue = useMemo(() => ({ serverInfo }), [serverInfo]);

  return (
    <AdminHostProvider value={kit}>
      <ModuleSlotProvider registry={moduleRegistry}>
        <AdminContext.Provider value={adminValue}>{children}</AdminContext.Provider>
      </ModuleSlotProvider>
    </AdminHostProvider>
  );
}

export function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const step = useBreakpoint();
  const wide = step === 'lg' || step === 'tv';
  return (
    <AdminProvider>
      <Box row={wide} h="100%" bg="bg">
        {wide ? <AdminSidebar /> : <AdminMobileTopbar />}
        <ScrollView style={ADMIN_SCROLLER} contentContainerStyle={ADMIN_SCROLLER_CONTENT}>
          <PageFrame>{children}</PageFrame>
        </ScrollView>
      </Box>
      <AdminModalHosts />
    </AdminProvider>
  );
}
