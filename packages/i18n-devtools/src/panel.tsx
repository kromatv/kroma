import { LOCALES } from '@kroma/core';
import { Button, Column, IconButton, Row, Surface, Text } from '@kroma/ui/kit';

export interface PanelProps {
  locale: string | null;
  appLocale: string;
  keys: boolean;
  onLocale: (locale: string | null) => void;
  onKeys: (keys: boolean) => void;
  onClose: () => void;
  keysChord: string;
  panelChord: string;
}

const WIDTH_PX = 300;

export function Panel({
  locale,
  appLocale,
  keys,
  onLocale,
  onKeys,
  onClose,
  keysChord,
  panelChord,
}: Readonly<PanelProps>) {
  const active = locale ?? appLocale;
  return (
    <Surface tone="raised" pad="md" elevated gap={14} style={{ width: WIDTH_PX }}>
      <Row align="center" justify="space-between">
        <Text variant="label">i18n devtools</Text>
        <Text variant="meta" color="textDim">
          {panelChord}
        </Text>
        <IconButton icon="x" label="Close" control="sm" variant="ghost" onPress={onClose} />
      </Row>

      <Column gap={6}>
        <Text variant="overline" color="textDim">
          Locale
        </Text>
        <Row gap={6}>
          {LOCALES.map(({ code }) => (
            <Button
              key={code}
              size="sm"
              variant={locale === code ? 'primary' : 'ghost'}
              label={code.toUpperCase()}
              onPress={() => onLocale(code)}
            />
          ))}
          <Button
            size="sm"
            variant={locale === null ? 'primary' : 'ghost'}
            label={`Auto (${appLocale})`}
            onPress={() => onLocale(null)}
          />
        </Row>
        <Text variant="meta" color="textDim">
          This tab only. Nothing is saved and the account keeps its language, so text the server
          writes stays in {appLocale}.
        </Text>
      </Column>

      <Column gap={6}>
        <Text variant="overline" color="textDim">
          Message keys
        </Text>
        <Button
          size="sm"
          block
          icon="language"
          variant={keys ? 'primary' : 'glass'}
          label={keys ? 'Showing keys' : 'Show keys'}
          onPress={() => onKeys(!keys)}
        />
        <Text variant="meta" color="textDim">
          Every message becomes [catalog/key], so {active} text with no brackets did not come from a
          catalog. {keysChord} does the same.
        </Text>
      </Column>
    </Surface>
  );
}
