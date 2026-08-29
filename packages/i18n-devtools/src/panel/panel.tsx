import type { IconName } from '@kroma/ui/kit';
import { Divider, Icon, IconButton, Row, SegmentGroup, Surface, Text } from '@kroma/ui/kit';
import type { Outline } from '../live';
import { Chord, chordName, HOLD } from './chord';
import { GRIP_DATA } from './drag';
import { EditorPicker } from './editor-picker';
import { EngineBadge } from './engine-badge';
import { LocalePicker } from './locale-picker';

export interface PanelProps {
  locale: string;
  keys: boolean;
  outline: Outline;
  editor: string | null;
  onLocale: (locale: string) => void;
  onKeys: (keys: boolean) => void;
  onOutline: (outline: Outline) => void;
  onEditor: (editor: string | null) => void;
  onClose: () => void;
  /** The letter each chord is pressed with, held with `HOLD`. */
  keysKey: string;
  outlineKey: string;
  panelKey: string;
}

const WIDTH_PX = 320;
const GLYPH = 16;

const MODES: ReadonlyArray<{ value: Outline; label: string; icon: IconName }> = [
  { value: 'off', label: 'Off', icon: 'eye-off' },
  { value: 'problems', label: 'Issues', icon: 'alert-triangle' },
  { value: 'all', label: 'All', icon: 'eye' },
];

export function Panel({
  locale,
  keys,
  outline,
  editor,
  onLocale,
  onKeys,
  onOutline,
  onEditor,
  onClose,
  keysKey,
  outlineKey,
  panelKey,
}: Readonly<PanelProps>) {
  return (
    <Surface tone="raised" pad="md" elevated gap={10} style={{ width: WIDTH_PX }}>
      <Row align="center" justify="space-between" gap={8} dataSet={GRIP_DATA}>
        <Row align="center" gap={7}>
          <Icon name="grip-vertical" size={GLYPH} color="textDim" />
          <Text variant="label">i18n devtools</Text>
        </Row>
        <Row align="center" gap={6}>
          <Chord hold={HOLD} press={panelKey} />
          <IconButton icon="x" label="Close" control="sm" variant="ghost" onPress={onClose} />
        </Row>
      </Row>

      <LocalePicker locale={locale} onLocale={onLocale} />

      <Row align="center" gap={6}>
        <SegmentGroup.Root
          label={`Outline (${chordName(outlineKey)})`}
          size="sm"
          stretch
          value={outline}
          onValueChange={onOutline}
          style={GROW}
        >
          {MODES.map(({ value, label, icon }) => (
            <SegmentGroup.Item key={value} value={value} icon={icon}>
              <SegmentGroup.Label>{label}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
        <IconButton
          icon="braces"
          label={`Show message keys (${chordName(keysKey)})`}
          control="sm"
          variant="glass"
          active={keys}
          onPress={() => onKeys(!keys)}
        />
      </Row>

      <EditorPicker editor={editor} onEditor={onEditor} />

      <Divider />

      <EngineBadge />
    </Surface>
  );
}

const GROW = { flexGrow: 1 } as const;
