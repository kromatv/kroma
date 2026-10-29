import { useState } from 'react';
import {
  Button,
  Column,
  Divider,
  Icon,
  IconButton,
  Row,
  SegmentGroup,
  Surface,
  Switch,
  Text,
  styles,
  useStyles,
} from '@kromatv/ui/kit';
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
  onReset: () => void;
  canReset: boolean;
  /** The letter each chord is pressed with, held with `HOLD`. */
  keysKey: string;
  outlineKey: string;
  panelKey: string;
}

const MODES: ReadonlyArray<{ value: Outline; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'problems', label: 'Issues' },
  { value: 'all', label: 'All text' },
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
  onReset,
  canReset,
  keysKey,
  outlineKey,
  panelKey,
}: Readonly<PanelProps>) {
  const s = useStyles(panelStyles);
  const [options, setOptions] = useState(false);
  return (
    <Surface tone="raised" pad="none" p={16} elevated gap={14} style={s.panel}>
      <Row between gap={8}>
        <Row gap={8} dataSet={GRIP_DATA} style={s.grip}>
          <Icon name="grip-vertical" size={16} color="textDim" />
          <Text variant="label">Translations</Text>
        </Row>
        <IconButton icon="x" label="Close" control="sm" variant="ghost" onPress={onClose} />
      </Row>

      <LocalePicker locale={locale} onLocale={onLocale} />

      <Column gap={6}>
        <Text variant="meta" color="textMuted">
          Highlight
        </Text>
        <SegmentGroup.Root
          label={`Highlight (${chordName(outlineKey)})`}
          size="sm"
          stretch
          value={outline}
          onValueChange={onOutline}
        >
          {MODES.map(({ value, label }) => (
            <SegmentGroup.Item key={value} value={value}>
              <SegmentGroup.Label>{label}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
        {outline !== 'off' && (
          <Text variant="meta" color="textMuted">
            Hover over highlighted text to inspect.
          </Text>
        )}
      </Column>

      <Row between gap={12}>
        <Text variant="meta">Show message keys</Text>
        <Switch
          label={`Show message keys (${chordName(keysKey)})`}
          checked={keys}
          onCheckedChange={onKeys}
        />
      </Row>

      <Divider />
      <Row between gap={8}>
        <Button
          label="Options"
          variant="ghost"
          size="sm"
          focusScale={1}
          iconRight={options ? 'chevron-up' : 'chevron-down'}
          expanded={options}
          onPress={() => setOptions(!options)}
        />
        <Button
          label="Reset"
          variant="ghost"
          size="sm"
          focusScale={1}
          disabled={!canReset}
          onPress={onReset}
        />
      </Row>
      {options && (
        <Column gap={12}>
          <EditorPicker editor={editor} onEditor={onEditor} />
          <EngineBadge />
          <Divider />
          <Row between gap={8}>
            <Text variant="meta" color="textMuted">
              Highlight
            </Text>
            <Chord hold={HOLD} press={outlineKey} />
          </Row>
          <Row between gap={8}>
            <Text variant="meta" color="textMuted">
              Message keys
            </Text>
            <Chord hold={HOLD} press={keysKey} />
          </Row>
          <Row between gap={8}>
            <Text variant="meta" color="textMuted">
              Open / close
            </Text>
            <Chord hold={HOLD} press={panelKey} />
          </Row>
        </Column>
      )}
    </Surface>
  );
}

const panelStyles = styles({
  panel: {
    w: 320,
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'calc(100dvh - 32px)',
    overflowY: 'auto',
    shadow: 'card',
  },
  grip: { grow: 1, shrink: 1, minW: 0, cursor: 'move', touchAction: 'none', userSelect: 'none' },
});
