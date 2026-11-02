import type { Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, Icon, Row, Text } from '@kromatv/ui/kit';
import type { ModuleAccess } from '#web/features/admin/module-permissions';
import {
  consentOverview,
  extendedSentence,
  type SharedAccess,
} from '#web/features/admin/module-permissions-overview';
import { PermissionsSheet } from '#web/features/admin/module-permissions-sheet';
import { ModuleVerdict, Verdict } from '#web/features/admin/module-permissions-verdict';
import { CATEGORY_VIEW, GLYPH_SIZE, lineKey } from '#web/features/admin/module-permissions-view';
import { listOf } from '#web/features/admin/module-permissions-words';

function whoSays(line: SharedAccess, declared: number, t: Translate): string | null {
  if (declared < 2) return null;
  if (line.modules.length === declared)
    return t('modulePermissions.allModules', { count: declared });
  return listOf(line.modules, t);
}

function SharedLine({ line, declared }: Readonly<{ line: SharedAccess; declared: number }>) {
  const t = useT();
  const who = whoSays(line, declared, t);
  return (
    <Row gap={14} align="flex-start" py={7}>
      <Box pt={1}>
        <Icon name={CATEGORY_VIEW[line.category].icon} size={GLYPH_SIZE} color="glyph" />
      </Box>
      <Box flex minW={0} gap={2}>
        <Text variant="label">{t(lineKey(line.category, line.access))}</Text>
        <Text variant="meta" color="textMuted">
          {who
            ? t('modulePermissions.lineDetail', { detail: line.brief, modules: who })
            : line.brief}
        </Text>
      </Box>
    </Row>
  );
}

function Reach({
  entries,
  extended,
  updating,
}: Readonly<{
  entries: readonly ModuleAccess[];
  extended: readonly { id: string; line: string }[];
  updating: boolean;
}>) {
  const t = useT();
  const [only] = entries;
  if (entries.length === 1 && only) {
    if (!updating) return <ModuleVerdict source={only.source} />;
    const sentence = only.source ? extendedSentence(only.source, t) : null;
    if (!sentence) return null;
    return (
      <Verdict extended title={t('modulePermissions.extended')}>
        <Callout.Detail>{sentence}</Callout.Detail>
      </Verdict>
    );
  }
  if (extended.length > 0) {
    return (
      <Verdict extended title={t('modulePermissions.extendedCount', { count: extended.length })}>
        {extended.map((one) => (
          <Callout.Detail key={one.id}>{one.line}</Callout.Detail>
        ))}
      </Verdict>
    );
  }
  if (updating) return null;
  return (
    <Verdict extended={false} title={t('modulePermissions.noneExtended')}>
      <Callout.Detail>{t('modulePermissions.noneExtendedHint')}</Callout.Detail>
    </Verdict>
  );
}

/** What an install lets its modules do, said once for all of them, with the
 *  sheet one press away. An update says only what it adds: `entries` then
 *  carries what is new, and `sheet` everything each module declares.
 *  `unofficial` counts the modules the official registry does not ship. */
export function ConsentSummary({
  entries,
  sheet,
  updating,
  unofficial,
}: Readonly<{
  entries: readonly ModuleAccess[];
  sheet: readonly ModuleAccess[];
  updating: boolean;
  unofficial: number;
}>) {
  const t = useT();
  const { extended, shared } = consentOverview(entries, t);
  const declared = entries.filter((entry) => entry.source).length;
  const heading = updating
    ? t('modulePermissions.canDoAdded')
    : t('modulePermissions.canDo', { count: entries.length });
  const nothingNew = updating && extended.length === 0 && shared.length === 0;
  return (
    <Box gap={12}>
      <Text variant="label" accessibilityRole="header">
        {heading}
      </Text>
      <Reach entries={entries} extended={extended} updating={updating} />
      {unofficial > 0 ? (
        <Callout.Root icon="info-circle">
          <Callout.Title>{t('modulePermissions.thirdParty', { count: unofficial })}</Callout.Title>
        </Callout.Root>
      ) : null}
      {nothingNew ? (
        <Text variant="meta" color="textMuted">
          {t('modulePermissions.nothingAdded')}
        </Text>
      ) : null}
      {shared.length > 0 ? (
        <Box>
          {shared.map((line) => (
            <SharedLine key={line.category} line={line} declared={declared} />
          ))}
        </Box>
      ) : null}
      <Row ml={-14}>
        <Button
          variant="ghost"
          size="sm"
          iconRight="chevron-right"
          label={t(
            sheet.length > 1 ? 'modulePermissions.detailsPerModule' : 'modulePermissions.details',
          )}
          onPress={() => void PermissionsSheet.call({ modules: sheet })}
        />
      </Row>
    </Box>
  );
}
