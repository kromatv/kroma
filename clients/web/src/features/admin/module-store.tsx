// The Discover tab of the Modules page: every module the configured registries
// offer, enriched with this server's verdict. A card opens the detail drawer;
// its action installs (through the plan dialog), updates, or shows the
// installed state, and a live `module.op.*` stream replaces the action with a
// download/install progress bar.

import type { StoreCatalog, StoreModule } from '@kroma/core';
import { useFormat, useT } from '@kroma/ui';
import {
  Badge,
  Box,
  Button,
  CardSkeleton,
  EmptyState,
  Grid,
  Icon,
  Progress,
  Row,
  Surface,
  Text,
} from '@kroma/ui/kit';
import { useId } from 'react';
import { matchesQuery } from '#web/features/admin/module-api';
import { type OpModule, opPct, PHASE_KEY, runningPct } from '#web/features/admin/module-ops';
import { ADMIN_PRESS, PRESSABLE } from '#web/features/admin/web-style';
import { Image } from '#web/shared/ui';

/** Compact live progress: the phase label above a thin bar. */
export function OpProgress({ op }: Readonly<{ op: OpModule }>) {
  const t = useT();
  const pct = opPct(op);
  const label = t(PHASE_KEY[op.phase]);
  return (
    <Box w={112} shrink={0}>
      <Row between mb={4}>
        <Text variant="overline" color="textDim">
          {label}
        </Text>
        {pct !== null && op.phase === 'download' && (
          <Text variant="overline" color="textDim">
            {pct}%
          </Text>
        )}
      </Row>
      <Progress value={runningPct(op.phase, pct) / 100} thickness={4} rounded />
    </Box>
  );
}

function CardAction({
  m,
  op,
  onInstall,
  onUpdate,
}: Readonly<{
  m: StoreModule;
  op: OpModule | undefined;
  onInstall: () => void;
  onUpdate: () => void;
}>) {
  const t = useT();
  if (op) return <OpProgress op={op} />;
  if (!m.compatible) {
    return <Badge tone="neutral">{t('admin.modulesIncompatible')}</Badge>;
  }
  if (m.installedVersion && m.updateAvailable) {
    return (
      <Button variant="primary" size="sm" label={t('admin.modulesUpdate')} onPress={onUpdate} />
    );
  }
  if (m.installedVersion) {
    return (
      <Row shrink={0} gap={4}>
        <Icon name="circle-check-filled" size={15} color="success" />
        <Text variant="meta" color="success">
          {t('admin.modulesInstalled')}
        </Text>
      </Row>
    );
  }
  return <Button variant="glass" size="sm" label={t('admin.modulesInstall')} onPress={onInstall} />;
}

function StoreCard({
  m,
  op,
  onOpen,
  onInstall,
  onUpdate,
}: Readonly<{
  m: StoreModule;
  op: OpModule | undefined;
  onOpen: () => void;
  onInstall: () => void;
  onUpdate: () => void;
}>) {
  const t = useT();
  const fmt = useFormat();
  const id = useId();
  return (
    <Surface
      elevated
      pad="none"
      radius="xl"
      p={16}
      gap={12}
      row
      align="flex-start"
      opacity={m.compatible ? 1 : 0.7}
      dataSet={PRESSABLE}
    >
      <button type="button" className={ADMIN_PRESS} aria-labelledby={id} onClick={onOpen} />
      <Box w={40} h={40} mt={2} radius="lg" overflow="hidden" bg={m.icon ? undefined : 'tint/5'}>
        {m.icon ? <Image src={m.icon} fit="cover" fill /> : null}
      </Box>
      <Box flex minW={0}>
        <Row between gap={12}>
          <Text id={id} variant="label" lines={1}>
            {m.name}
          </Text>
          <CardAction m={m} op={op} onInstall={onInstall} onUpdate={onUpdate} />
        </Row>
        <Row wrap gap={6} mt={2}>
          <Text variant="meta" color="textDim">
            v{m.version}
          </Text>
          {m.size ? (
            <Text variant="meta" color="textDim">
              · {fmt.bytes(m.size)}
            </Text>
          ) : null}
          <Text variant="meta" color={m.source === 'Official' ? 'accentText' : 'textDim'}>
            · {m.source === 'Official' ? t('admin.modulesOfficial') : m.source}
          </Text>
          {m.library && (
            <Text variant="meta" color="textDim">
              · {t('admin.modulesLibraryChip')}
            </Text>
          )}
          {m.installedVersion && m.updateAvailable && (
            <Text variant="meta" color="accentText">
              · {t('admin.modulesUpdateChip', { version: m.version })}
            </Text>
          )}
        </Row>
        {m.description && (
          <Text variant="meta" color="textMuted" lines={2} mt={4}>
            {m.description}
          </Text>
        )}
        {!m.compatible && m.reason && (
          <Text variant="meta" color="danger" mt={4}>
            {m.reason}
          </Text>
        )}
      </Box>
    </Surface>
  );
}

/** The merged catalog grid; loading, blackout and no-match states included so
 * the registry state is never a mystery. Per-registry status lives in the
 * Registries drawer. */
export function StoreGrid({
  catalog,
  query,
  active,
  onOpen,
  onInstall,
  onUpdate,
}: Readonly<{
  catalog: StoreCatalog | null | undefined;
  query: string;
  active: Map<string, OpModule & { op: string }>;
  onOpen: (id: string) => void;
  onInstall: (id: string) => void;
  onUpdate: (id: string) => void;
}>) {
  const t = useT();
  if (!catalog) {
    return (
      <Grid min={320} gap={12}>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </Grid>
    );
  }
  // Only a total blackout is an error here: with several registries configured,
  // one unreachable host still leaves a usable catalog, and its failure is
  // reported on its row in the Registries drawer.
  if (catalog.modules.length === 0 && catalog.error) {
    return (
      <Surface elevated pad="none" radius="xl" p={20} gap={8}>
        <Text variant="label" color="danger">
          {t('admin.modulesCatalogError')}
        </Text>
        <Text variant="meta" color="textMuted">
          {catalog.error}
        </Text>
        <Text variant="meta" color="textMuted">
          {t('admin.modulesCatalogErrorHint')}
        </Text>
      </Surface>
    );
  }
  const shown = catalog.modules
    .filter((m) => matchesQuery(m, query))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (shown.length === 0) {
    return (
      <EmptyState.Root icon="search">
        <EmptyState.Title>
          {t('admin.modulesEmptySearch', { query: query.trim() })}
        </EmptyState.Title>
      </EmptyState.Root>
    );
  }
  return (
    <Grid min={320} gap={12}>
      {shown.map((m) => (
        <StoreCard
          key={m.id}
          m={m}
          op={active.get(m.id)}
          onOpen={() => onOpen(m.id)}
          onInstall={() => onInstall(m.id)}
          onUpdate={() => onUpdate(m.id)}
        />
      ))}
    </Grid>
  );
}
