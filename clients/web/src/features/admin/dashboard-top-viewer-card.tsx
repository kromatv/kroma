import type { TopUser, WatchKind } from '@kroma/client/admin';
import { resolveImageUrl } from '@kroma/core';
import { TABULAR } from '@kroma/module-sdk';
import { useFormat, useT } from '@kroma/ui';
import {
  Avatar,
  Box,
  color,
  Divider,
  Focusable,
  Icon,
  Row,
  Surface,
  sv,
  Text,
} from '@kroma/ui/kit';
import { KIND_SERIES } from '#web/features/admin/chart-palette';
import { kindLabelKey, WATCH_KINDS } from '#web/features/admin/dashboard-filters';
import { dominantKind, kindTotals } from '#web/features/admin/dashboard-kind-totals';
import { PillDot } from '#web/features/admin/pill';
import { apiBase } from '#web/shared/lib/api';
import { RouteLink } from '#web/shared/ui/route-link';

const FACE = 48;
const HEAD_PAD = 18;
const HEAD_HEIGHT = FACE + HEAD_PAD * 2;

const ROW_RULE = { borderBottomWidth: 1, borderBottomColor: color('tint/4') } as const;

const viewerCard = sv({
  base: {
    radius: 'xl',
    border: 'border',
    bg: 'surface1',
    shadow: 'card',
    overflow: 'hidden',
    _hover: { border: 'accent/40', bg: 'accentSoft' },
    _focus: { border: 'accent/40', bg: 'accentSoft' },
  },
});

export function TopViewerCard({ user }: Readonly<{ user: TopUser }>) {
  const t = useT();
  const account = user.userId;

  if (!account) {
    return (
      <Surface elevated pad="none" radius="xl" border="border" overflow="hidden">
        <ViewerFace user={user} active={false} />
      </Surface>
    );
  }

  return (
    <Focusable sv={viewerCard} label={`${t('admin.viewMemberHistory')} · ${user.username}`} asChild>
      {({ hovered, focused }) => (
        <RouteLink to="/admin/history" search={{ user: account }}>
          <ViewerFace user={user} active={hovered || focused} />
        </RouteLink>
      )}
    </Focusable>
  );
}

function ViewerFace({ user, active }: Readonly<{ user: TopUser; active: boolean }>) {
  const totals = kindTotals(user.byKind, user.filmsMs, user.tvMs);
  const dominant = dominantKind(totals);
  return (
    <>
      {active ? <ViewerInvite /> : <ViewerTotals user={user} />}
      <Divider color="tint/5" />
      <Box bg={active ? 'accentWash/10' : 'surface2'} px={20} py={11}>
        <Text variant="label">{user.username}</Text>
      </Box>
      <Divider color="tint/5" />
      <Box>
        {WATCH_KINDS.map((kind) => (
          <KindRow key={kind} kind={kind} watchedMs={totals[kind]} dominant={kind === dominant} />
        ))}
      </Box>
    </>
  );
}

function ViewerInvite() {
  const t = useT();
  return (
    <Row gap={10} px={20} h={HEAD_HEIGHT} bg="accent">
      <Icon name="history" size={18} color="accentInk" />
      <Text variant="label" color="accentInk">
        {t('admin.viewMemberHistory')}
      </Text>
    </Row>
  );
}

function ViewerTotals({ user }: Readonly<{ user: TopUser }>) {
  const t = useT();
  const fmt = useFormat();
  return (
    <Row gap={14} px={20} h={HEAD_HEIGHT}>
      <Avatar
        name={user.username}
        src={resolveImageUrl(apiBase(), user.avatarUrl)}
        size={FACE}
        circle
      />
      <Box>
        <Text variant="title">{t('admin.plays', { count: user.plays })}</Text>
        <Text variant="meta" color="textMuted">
          {fmt.duration(user.watchedMs)}
        </Text>
      </Box>
    </Row>
  );
}

interface KindRowProps {
  kind: WatchKind;
  watchedMs: number;
  dominant: boolean;
}

function KindRow({ kind, watchedMs, dominant }: Readonly<KindRowProps>) {
  const t = useT();
  const fmt = useFormat();
  return (
    <Row between px={20} py={11} bg={dominant ? 'accentWash/16' : 'transparent'} style={ROW_RULE}>
      <Row gap={8}>
        <PillDot tone={KIND_SERIES[kind]} size={7} />
        <Text variant="meta" color={dominant ? 'accentText' : 'textMuted'}>
          {t(kindLabelKey(kind))}
        </Text>
      </Row>
      <Text variant="meta" color={dominant ? 'accentText' : 'textMuted'} style={TABULAR}>
        {fmt.duration(watchedMs)}
      </Text>
    </Row>
  );
}
