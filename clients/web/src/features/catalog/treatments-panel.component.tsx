import {
  activeTheme,
  Box,
  classes,
  color,
  Spinner,
  styles,
  Text,
  useStyleScope,
  useStyles,
  useThemeVersion,
} from '@kromatv/ui/kit';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

// Per-element "Traitements" panel (admin-only): the status of every processing
// treatment applied to this film/episode/show (probe, TMDB, storyboard previews,
// markers, embedding), plus a one-click reprocess and a "fix the TMDB match"
// action. The treatment list needs `settings.manage`; fixing a match needs
// `library.manage`. Either shows the strip; each control gates itself.

import { hasPermission } from '@kromatv/client/accounts';
import { ItemId, ShowId } from '@kromatv/client/media';
import type { Treatment } from '@kromatv/client/pipeline';
import { useT } from '@kromatv/ui';

import {
  IconAlertTriangleFilled,
  IconCircle,
  IconCircleCheckFilled,
  IconLoader2,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TitleActions } from '#web/features/catalog/title-actions.component';

import { useAuth } from '#web/shared/lib/auth';
import { useLater } from '#web/shared/lib/use-later.hook';

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
const sDefinition = styles({ treatment: { display: 'inline-flex', alignItems: 'center', gap: 6 } });

export function TreatmentsPanel({
  kind,
  id,
  title,
}: Readonly<{ kind: Kind; id: string; title: string }>) {
  const webRuntime = useWebRuntime();

  const scope = useStyleScope();
  useThemeVersion();

  const s = useStyles(sDefinition);

  const t = useT();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const later = useLater();
  const subjectId = kind === 'show' ? ShowId.parse(id) : ItemId.parse(id);
  const admin = !!user && hasPermission(user, 'settings.manage');
  const canManageLibrary = !!user && hasPermission(user, 'library.manage');

  const queryKey = ['treatments', kind, id] as const;
  const { data: treatments = null } = useQuery({
    queryKey,
    queryFn: async (): Promise<Treatment[]> => {
      const c = webRuntime.client;
      const r = await (kind === 'show' ? c.pipeline.show(subjectId) : c.pipeline.item(subjectId));
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
  if (!admin && !canManageLibrary) {
    return null;
  }
  if (admin && !treatments) {
    return null;
  }

  const refresh = () => {
    later(() => queryClient.invalidateQueries({ queryKey }), 1500);
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
              className={classes(s.treatment)}
              title={t(`pipeline.st.${tr.status}`)}
            >
              {spin ? (
                <Spinner size={16} color={meta.ink} />
              ) : (
                <Icon size={16} color={color(meta.ink, activeTheme(scope.theme))} />
              )}
              <Text variant="meta" color="white/80">
                {t(`pipeline.t.${tr.key}`)}
              </Text>
            </span>
          );
        })}
        <TitleActions kind={kind} id={id} title={title} onChanged={refresh} />
      </Box>
    </section>
  );
}
