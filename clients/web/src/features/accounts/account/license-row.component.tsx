import type { LicenseSurface, ShippedPackage } from '@kromatv/core';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Button, Icon, ListRow, Text } from '@kromatv/ui/kit';
import type { CSSProperties } from 'react';
import { Linking } from 'react-native';

const SURFACE: Record<LicenseSurface, MessageKey> = {
  server: 'licenses.server',
  web: 'licenses.web',
};

const SCROLLS: CSSProperties = { maxHeight: 360, overflowY: 'auto' };

function SourceLink({ href }: Readonly<{ href: string }>) {
  const t = useT();
  return (
    <Box row>
      <Button
        variant="ghost"
        size="sm"
        icon="external-link"
        label={t('licenses.source')}
        onPress={() => void Linking.openURL(href)}
      />
    </Box>
  );
}

function NoticeText({ text }: Readonly<{ text: string }>) {
  return (
    <Box radius="md" border="border" bg="tint/3" p={14}>
      <div style={SCROLLS}>
        <Text variant="meta" font="mono" color="textMuted">
          {text}
        </Text>
      </div>
    </Box>
  );
}

function LicenseNotice({ pkg }: Readonly<{ pkg: ShippedPackage }>) {
  const t = useT();
  return (
    <Box px={16} pb={16} gap={12}>
      {pkg.source ? <SourceLink href={pkg.source} /> : null}
      {pkg.texts.length === 0 ? (
        <Text variant="meta" color="textMuted">
          {t('licenses.noText')}
        </Text>
      ) : null}
      {pkg.texts.map((text) => (
        <NoticeText key={text} text={text} />
      ))}
    </Box>
  );
}

/** One package on the licenses card: its name, license and the builds that
 * ship it, opening onto its source and its notice texts. */
export function LicenseRow({
  pkg,
  open,
  onToggle,
}: Readonly<{ pkg: ShippedPackage; open: boolean; onToggle: () => void }>) {
  const t = useT();
  const where = pkg.surfaces.map((surface) => t(SURFACE[surface])).join(', ');
  const hint = `${pkg.license ?? t('licenses.unknown')} · ${where}`;
  return (
    <>
      <ListRow.Root onPress={onToggle} expanded={open} chevron={false}>
        <ListRow.Label>{pkg.name}</ListRow.Label>
        <ListRow.Hint lines={1}>{hint}</ListRow.Hint>
        <ListRow.Trailing>
          {pkg.version ? (
            <Text variant="meta" color="textMuted" font="mono">
              {pkg.version}
            </Text>
          ) : null}
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color="textDim" />
        </ListRow.Trailing>
      </ListRow.Root>
      {open ? <LicenseNotice pkg={pkg} /> : null}
    </>
  );
}
