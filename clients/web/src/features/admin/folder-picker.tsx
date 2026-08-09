// A server-side folder browser: `value` is the committed path and `onChange`
// fires on "use this folder"; browsing state is internal, seeded from `value`.
// `onCancel` adds a cancel button for callers that show the browser on demand.
import type { AdminFsList } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, IconButton } from '@kroma/ui/kit';
import { IconChevronRight, IconFolder } from '@tabler/icons-react';
import { type ReactNode, useEffect, useState } from 'react';
import { kromaClient } from '#web/shared/lib/api';

const SELECTED_FILL = {
  backgroundColor: 'rgba(70, 208, 141, 0.15)',
  borderColor: 'rgba(70, 208, 141, 0.35)',
} as const;

const DASHED = {
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.2)',
  borderStyle: 'dashed',
} as const;

export function FolderPicker({
  value,
  onChange,
  onCancel,
}: Readonly<{ value: string; onChange: (path: string) => void; onCancel?: () => void }>) {
  const t = useT();
  const [path, setPath] = useState(value || '');
  const [list, setList] = useState<AdminFsList | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    kromaClient()
      .adminBrowseFolders(path)
      .then((res) => {
        if (active) setList(res);
      })
      .catch(() => {
        if (active) setList(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);

  const atRoot = path === '';
  const entries = list?.entries ?? [];
  const canSelect = !atRoot;
  const isSelected = !atRoot && value === path;

  let listBody: ReactNode;
  if (loading && entries.length === 0) {
    listBody = (
      <div className="px-3 py-6 text-center text-[12.5px] text-dim">{t('common.loading')}</div>
    );
  } else if (entries.length === 0) {
    listBody = (
      <div className="px-3 py-6 text-center text-[12.5px] text-dim">{t('admin.noSubfolders')}</div>
    );
  } else {
    listBody = entries.map((e) => (
      <button
        key={e.path}
        type="button"
        onClick={() => setPath(e.path)}
        className="flex w-full items-center gap-2.5 px-3 py-2.25 text-left hover:bg-white/5"
      >
        <IconFolder size={16} stroke={1.8} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text/78">
          {e.name}
        </span>
        <IconChevronRight size={14} stroke={2} className="shrink-0 text-text/35" />
      </button>
    ));
  }

  return (
    <div className="overflow-hidden rounded-md border border-border-strong bg-[#0F0F13]">
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2.5">
        <IconButton
          variant="ghost"
          control="sm"
          icon="corner-left-up"
          label={t('admin.parentFolder')}
          onPress={() => list?.parent != null && setPath(list.parent)}
          disabled={list?.parent == null}
        />
        <IconFolder size={15} stroke={1.8} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text/80">
          {atRoot ? t('admin.volumes') : path}
        </span>
      </div>

      <div className="max-h-52 overflow-y-auto">{listBody}</div>

      <div className="flex items-center justify-between gap-2 border-t border-white/6 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-dim">
          {value || ''}
        </span>
        {onCancel ? (
          <Button size="sm" variant="ghost" label={t('common.cancel')} onPress={onCancel} />
        ) : null}
        <Button
          size="sm"
          variant={isSelected ? 'glass' : 'primary'}
          icon="check"
          label={t('admin.selectFolder')}
          onPress={() => onChange(path)}
          disabled={!canSelect}
          style={isSelected ? SELECTED_FILL : null}
        />
      </div>
    </div>
  );
}

/** A folder input that keeps the browser closed until asked for: a dashed add
 * button while empty, the committed path once set (editable, and removable when
 * `onClear` is given), expanding into the [`FolderPicker`] on demand. */
export function FolderField({
  value,
  onChange,
  placeholder,
  onClear,
}: Readonly<{
  value: string;
  onChange: (path: string) => void;
  placeholder: string;
  onClear?: () => void;
}>) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <FolderPicker
        value={value}
        onChange={(path) => {
          onChange(path);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    );
  }
  if (!value) {
    return (
      <Button
        variant="ghost"
        size="sm"
        icon="plus"
        label={placeholder}
        onPress={() => setOpen(true)}
        style={DASHED}
      />
    );
  }
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border bg-[#0F0F13] px-3 py-2">
      <IconFolder size={16} stroke={1.8} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text/78">
        {value}
      </span>
      <IconButton
        variant="ghost"
        size={26}
        glyph={15}
        icon="pencil"
        label={t('admin.changeFolder')}
        onPress={() => setOpen(true)}
      />
      {onClear ? (
        <IconButton
          variant="ghost"
          size={26}
          glyph={15}
          icon="x"
          label={t('admin.removeFolder')}
          onPress={onClear}
        />
      ) : null}
    </div>
  );
}
