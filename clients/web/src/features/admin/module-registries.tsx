// Registry management drawer: the pinned official catalog plus operator-added
// registries, each row carrying its live fetch status (rows live in
// module-registry-rows.tsx). Installing from a registry runs native code, so
// the list is admin-gated and every artifact stays https + sha256-verified
// server-side: adding a registry lists modules, it does not trust them.
// Resolves `true` when anything was saved, so the caller knows whether to
// refresh.

import { Button, Drawer, useAsyncAction, usePoll } from '@kroma/admin-kit';
import { useT } from '@kroma/ui';
import { IconButton } from '@kroma/ui/kit';
import { useRef, useState } from 'react';
import { createCallable } from 'react-call';
import { adminApi, fetchStoreCatalog, message } from '#web/features/admin/module-api';
import {
  AddRegistry,
  type ExtraRegistry,
  ExtraRow,
  OfficialRow,
} from '#web/features/admin/module-registry-rows';

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
      <div className="border-b border-white/[0.07] px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-[19px] font-bold">{t('admin.registriesTitle')}</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">{t('admin.registriesSub')}</p>
          </div>
          <IconButton
            variant="ghost"
            size={32}
            glyph={20}
            icon="x"
            label={t('common.close')}
            onPress={() => call.end(changed.current)}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
        {error && <p className="text-xs font-semibold text-danger">{error}</p>}
        {registries.length === 0 ? (
          <p className="text-xs text-muted">{t('common.loading')}</p>
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
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  label={t('common.save')}
                  onClick={() => commit(list)}
                  loading={saving}
                />
                <Button
                  variant="quiet"
                  label={t('common.cancel')}
                  onClick={() => setDraft(null)}
                  disabled={saving}
                />
              </div>
            )}
            <AddRegistry
              busy={saving}
              onAdd={(r) => commit([...list, { ...r, key: `added-${nextKey.current++}` }])}
            />
          </>
        )}
      </div>
    </Drawer>
  );
}, 300);
