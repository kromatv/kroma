// Per-element "Traitements" panel (admin-only): the status of every processing
// treatment applied to this film/episode/show (probe, TMDB, storyboard previews,
// markers, embedding), plus a one-click reprocess and a "fix the TMDB match"
// action. The treatment list needs `settings.manage`; fixing a match needs
// `library.manage`. Either shows the strip; each control gates itself.

import { hasPermission, type MessageKey, type Treatment } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, color, Spinner, Text } from '@kroma/ui/kit';
import {
  IconAlertTriangleFilled,
  IconCircle,
  IconCircleCheckFilled,
  IconLoader2,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, useState } from 'react';
import { MediaInfoModal } from '#web/features/catalog/media-info-modal';
import { RematchDialog } from '#web/features/catalog/rematch-dialog';
import { kromaClient } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';

type Kind = 'item' | 'show';

const STATUS = {
  done: { icon: IconCircleCheckFilled, ink: 'success' },
  running: { icon: IconLoader2, ink: 'accent', spin: true },
  pending: { icon: IconLoader2, ink: 'accent/70' },
  failed: { icon: IconAlertTriangleFilled, ink: 'danger' },
  missing: { icon: IconCircle, ink: 'white/25' },
} satisfies Record<string, { icon: TablerIcon; ink: string; spin?: boolean }>;

const PANEL_PAD = { base: 24, md: 64 } as const;

// A <span> so the native tooltip survives: react-native-web drops a `title`.
const TREATMENT: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

export function TreatmentsPanel({
  kind,
  id,
  title,
}: Readonly<{ kind: Kind; id: string; title: string }>) {
  const t = useT();
  const { user, client } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const admin = !!user && hasPermission(user, 'settings.manage');
  const canFix = !!user && hasPermission(user, 'library.manage');

  const queryKey = ['treatments', kind, id] as const;
  const { data: treatments = null } = useQuery({
    queryKey,
    queryFn: async (): Promise<Treatment[]> => {
      const c = kromaClient();
      const r = await (kind === 'show' ? c.showProcessing(id) : c.itemProcessing(id));
      return r.treatments;
    },
    enabled: admin,
    // Keep polling while anything is still processing, then stop.
    refetchInterval: (query) =>
      query.state.data?.some((x) => x.status === 'running' || x.status === 'pending')
        ? 3000
        : false,
  });

  // Nothing to offer without either permission; with `settings.manage` we also
  // wait for the treatment list so the strip does not flash in empty.
  if (!admin && !canFix) return null;
  if (admin && !treatments) return null;

  const reprocess = () => {
    setBusy(true);
    client
      .reprocessSubject(kind, id)
      .then(() => setTimeout(() => queryClient.invalidateQueries({ queryKey }), 1500))
      .catch(() => {})
      .finally(() => setTimeout(() => setBusy(false), 1500));
  };

  const openRematch = async () => {
    const applied = await RematchDialog.call({
      kind: kind === 'show' ? 'show' : 'movie',
      id,
      title,
    });
    // The correction re-runs enrichment in the background; give it a beat, then
    // pull the fresh treatments + art.
    if (applied) setTimeout(() => queryClient.invalidateQueries({ queryKey }), 1500);
  };

  return (
    <section>
      <Box
        row
        wrap
        align="center"
        gapX={24}
        gapY={10}
        mt={32}
        mx={PANEL_PAD}
        px={20}
        py={16}
        radius="xl"
        border="white/8"
        bg="white/3"
      >
        <Text variant="overline" color="white/45">
          {t('pipeline.treatments')}
        </Text>
        {(treatments ?? []).map((tr) => {
          const meta = STATUS[tr.status as keyof typeof STATUS] ?? STATUS.missing;
          const Icon = meta.icon;
          const spin = 'spin' in meta && meta.spin;
          return (
            <span
              key={tr.key}
              style={TREATMENT}
              title={t(`pipeline.st.${tr.status}` as MessageKey)}
            >
              {spin ? (
                <Spinner size={16} color={meta.ink} />
              ) : (
                <Icon size={16} color={color(meta.ink)} />
              )}
              <Text variant="meta" color="white/80">
                {t(`pipeline.t.${tr.key}` as MessageKey)}
              </Text>
            </span>
          );
        })}
        <Box row align="center" gap={8} ml="auto">
          {admin && kind === 'item' ? (
            <Button
              variant="glass"
              size="sm"
              icon="file-info"
              label={t('mediaInfo.action')}
              onPress={() => void MediaInfoModal.call({ id, title })}
            />
          ) : null}
          {canFix ? (
            <Button
              variant="glass"
              size="sm"
              icon="wand"
              label={t('rematch.action')}
              onPress={() => void openRematch()}
            />
          ) : null}
          {admin ? (
            <Button
              variant="glass"
              size="sm"
              icon="refresh"
              label={t('pipeline.reprocessBtn')}
              onPress={reprocess}
              loading={busy}
            />
          ) : null}
        </Box>
      </Box>
    </section>
  );
}
