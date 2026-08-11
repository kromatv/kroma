import { useT } from '@kroma/ui';
import { Box, Button, Icon, Section, Surface, Text } from '@kroma/ui/kit';
import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { ExportModal, ImportModal, isEncryptedFile } from '#web/features/admin/backup-modals';
import { Denied, PageHeader, useCap } from '#web/features/admin/shell';

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
      <PageHeader.Root title={t('admin.backupTitle')} subtitle={t('admin.backupSub')} />

      <Surface
        elevated
        pad="none"
        radius={16}
        border="border"
        row
        align="flex-start"
        gap={12}
        px={20}
        py={16}
        mt={24}
      >
        <Box mt={2} shrink={0}>
          <Icon name="alert-triangle" size={20} stroke={1.8} color="accent" />
        </Box>
        <Text variant="meta" color="text/70">
          {t('admin.backupWarning')}
        </Text>
      </Surface>

      <Section.Root title={t('admin.backupExportTitle')} mt={28}>
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
      </Section.Root>

      <Section.Root title={t('admin.backupImportTitle')} mt={28}>
        <ActionRow
          desc={t('admin.backupImportDesc')}
          action={
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".zip,.kroma,.json,application/zip,application/json"
                style={{ display: 'none' }}
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
          <Text variant="meta" color="success" mt={12}>
            {notice}
          </Text>
        ) : null}
      </Section.Root>
    </>
  );
}

function ActionRow({ desc, action }: Readonly<{ desc: string; action: React.ReactNode }>) {
  return (
    <Surface
      elevated
      pad="none"
      radius={16}
      border="border"
      row
      align="center"
      justify="space-between"
      gap={20}
      px={22}
      py={18}
    >
      <Text variant="meta" color="textDim" maxW={640}>
        {desc}
      </Text>
      <Box shrink={0}>{action}</Box>
    </Surface>
  );
}
