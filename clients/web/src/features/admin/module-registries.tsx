// Registry management drawer: the pinned official catalog plus operator-added
// registries, each row carrying its live fetch status (rows live in
// module-registry-rows.tsx). Installing from a registry runs native code, so
// the list is admin-gated and every artifact stays https + sha256-verified
// server-side: adding a registry lists modules, it does not trust them.
// Resolves `true` when anything was saved, so the caller knows whether to
// refresh.

import { useT } from '@kroma/ui';
import { Box, Button, Divider, Drawer, IconButton, Row, Text } from '@kroma/ui/kit';
import { useRef, useState } from 'react';
import { createCallable } from 'react-call';
import { useAsyncAction, usePoll } from '#web/features/admin/hooks';
import { adminApi, fetchStoreCatalog, message } from '#web/features/admin/module-api';
import {
  AddRegistry,
  type ExtraRegistry,
  ExtraRow,
  OfficialRow,
} from '#web/features/admin/module-registry-rows';
import { SCROLL_PANE } from '#web/features/admin/web-style';

// A row's React key is minted once and then carried through every edit. Keying
// on the URL itself would remount the row on each keystroke, dropping focus.
interface DraftRegistry extends ExtraRegistry {
  key: string;
}

function saveRegistries(extras: ExtraRegistry[]): Promise<unknown> {
  return adminApi('/settings', {
    method: 'PUT',
    body: JSON.stringify({ moduleRegistries: extras }),
  });
}

export const RegistriesDrawer = createCallable<Record<string, never>, boolean>(({ call }) => {
  const t = useT();
  const { data: catalog, reload } = usePoll(
    ['admin', 'store', 'catalog'],
    fetchStoreCatalog,
    300000,
  );
  const registries = catalog?.registries ?? [];
  const changed = useRef(false);
  const [draft, setDraft] = useState<DraftRegistry[] | null>(null);
  const nextKey = useRef(0);
  const { busy: saving, error, run } = useAsyncAction();
  const official = registries.find((r) => r.official);
  const extras = registries.filter((r) => !r.official);
  const list: DraftRegistry[] =
    draft ?? extras.map(({ name, url, enabled }) => ({ name, url, enabled, key: url }));
  const byUrl = new Map(extras.map((r) => [r.url, r]));

  const markSaved = () => {
    changed.current = true;
    void reload();
  };

  // Saved as typed, including an entry whose URL is not (yet) valid: the server
  // keeps those and reports why it skipped them, so a typo stays on screen to
  // be corrected instead of vanishing on save. The draft is dropped only once
  // the refetch has landed, or the rows would snap back to pre-save data.
  const commit = (next: DraftRegistry[]) => {
    setDraft(next);
    void run(async () => {
      await saveRegistries(next.map(({ name, url, enabled }) => ({ name, url, enabled })));
      changed.current = true;
      await reload();
      setDraft(null);
    }, message);
  };

  return (
    <Drawer
      open={!call.ended}
      onClose={() => call.end(changed.current)}
      title={t('admin.registriesTitle')}
      width={520}
    >
      <Box px={24} py={20}>
        <Row between>
          <Box>
            <Text variant="h2" accessibilityRole="header">
              {t('admin.registriesTitle')}
            </Text>
            <Text variant="meta" color="textMuted" mt={2}>
              {t('admin.registriesSub')}
            </Text>
          </Box>
          <IconButton
            variant="ghost"
            icon="x"
            label={t('common.close')}
            onPress={() => call.end(changed.current)}
          />
        </Row>
      </Box>
      <Divider color="tint/7" />

      <div style={SCROLL_PANE}>
        <Box gap={12} px={24} py={20}>
          {error && (
            <Text variant="meta" color="danger">
              {error}
            </Text>
          )}
          {registries.length === 0 ? (
            <Text variant="meta" color="textMuted">
              {t('common.loading')}
            </Text>
          ) : (
            <>
              {official && <OfficialRow status={official} onSaved={markSaved} />}
              {list.map(({ key, ...registry }) => (
                <ExtraRow
                  key={key}
                  registry={registry}
                  status={
                    byUrl.get(registry.url) ?? {
                      ...registry,
                      official: false,
                      moduleCount: 0,
                      shadowed: [],
                    }
                  }
                  busy={saving}
                  onChange={(next) =>
                    setDraft(list.map((r) => (r.key === key ? { ...next, key } : r)))
                  }
                  onRemove={() => commit(list.filter((r) => r.key !== key))}
                />
              ))}
              {draft !== null && (
                <Row gap={8}>
                  <Button
                    variant="primary"
                    size="sm"
                    label={t('common.save')}
                    onPress={() => commit(list)}
                    loading={saving}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    label={t('common.cancel')}
                    onPress={() => setDraft(null)}
                    disabled={saving}
                  />
                </Row>
              )}
              <AddRegistry
                busy={saving}
                onAdd={(r) => commit([...list, { ...r, key: `added-${nextKey.current++}` }])}
              />
            </>
          )}
        </Box>
      </div>
    </Drawer>
  );
}, 400);
