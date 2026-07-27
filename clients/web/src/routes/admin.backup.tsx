import { useT } from '@kroma/ui';
import { Button } from '@kroma/ui/kit';
import { IconAlertTriangle } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { ExportModal, ImportModal, isEncryptedFile } from '#web/features/admin/backup-modals';
import { Denied, PageHeader, useCap } from '#web/features/admin/shell';
import { C, Card, Section } from '#web/features/admin/ui';

export const Route = createFileRoute('/admin/backup')({
  component: BackupPage,
});

function BackupPage() {
  const t = useT();
  const canManage = useCap('settings.manage');
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!canManage) return <Denied />;

  async function onFilePicked(file: File) {
    setNotice(null);
    const encrypted = await isEncryptedFile(file);
    const msg = await ImportModal.call({ file, encrypted });
    if (fileRef.current) fileRef.current.value = '';
    if (msg) setNotice(msg);
  }

  return (
    <>
      <PageHeader title={t('admin.backupTitle')} subtitle={t('admin.backupSub')} />

      <Card className="mt-6 flex items-start gap-3 px-5 py-4">
        <IconAlertTriangle size={20} stroke={1.8} color={C.accent} className="mt-0.5 shrink-0" />
        <p className="text-[13.5px] font-medium text-text/70">{t('admin.backupWarning')}</p>
      </Card>

      <Section title={t('admin.backupExportTitle')}>
        <ActionRow
          desc={t('admin.backupExportDesc')}
          action={
            <Button
              variant="outline"
              active
              size="sm"
              icon="download"
              label={t('admin.backupExport')}
              onPress={() => void ExportModal.call()}
            />
          }
        />
      </Section>

      <Section title={t('admin.backupImportTitle')}>
        <ActionRow
          desc={t('admin.backupImportDesc')}
          action={
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".zip,.kroma,.json,application/zip,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFilePicked(file);
                }}
              />
              <Button
                variant="outline"
                active
                size="sm"
                icon="upload"
                label={t('admin.backupImport')}
                onPress={() => fileRef.current?.click()}
              />
            </>
          }
        />
        {notice ? (
          <p className="mt-3 text-[13px] font-semibold" style={{ color: C.green }}>
            {notice}
          </p>
        ) : null}
      </Section>
    </>
  );
}

function ActionRow({ desc, action }: Readonly<{ desc: string; action: React.ReactNode }>) {
  return (
    <Card className="flex items-center justify-between gap-5 px-5.5 py-4.5">
      <p className="max-w-160 text-[13.5px] text-dim">{desc}</p>
      <div className="shrink-0">{action}</div>
    </Card>
  );
}
