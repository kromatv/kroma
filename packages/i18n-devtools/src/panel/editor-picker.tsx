import { Column, IconButton, Row, Select, Text } from '@kromatv/ui/kit';
import { useEditors } from '../server/editors';
import { EditorIcon } from './editor-icon';

export interface EditorPickerProps {
  /** The editor chosen here, or `null` while the dev server may guess. */
  editor: string | null;
  onEditor: (editor: string | null) => void;
}

const AUTOMATIC = 'automatic';

export function EditorPicker({ editor, onEditor }: Readonly<EditorPickerProps>) {
  const { editors, loading, error, refresh } = useEditors();
  const missing = editor !== null && !editors.some(({ id }) => id === editor);
  const unavailable = missing && !loading && !error;
  return (
    <Column gap={6}>
      <Row between gap={8}>
        <Text variant="meta" color="textMuted">
          Open files in
        </Text>
        <IconButton
          icon="refresh"
          label="Refresh editors"
          control="sm"
          variant="ghost"
          disabled={loading}
          onPress={refresh}
        />
      </Row>
      <Select.Root
        label="Editor"
        placeholder="Automatic"
        value={editor ?? AUTOMATIC}
        onValueChange={(next) => onEditor(next === AUTOMATIC ? null : next)}
      >
        <Select.Trigger size="sm" block />
        <Select.Item value={AUTOMATIC}>
          <Select.Media>
            <EditorIcon id={AUTOMATIC} />
          </Select.Media>
          Automatic
        </Select.Item>
        {missing && (
          <Select.Item
            value={editor}
            label={unavailable ? `${editor} (unavailable)` : editor}
            disabled
          >
            <Select.Media>
              <EditorIcon id={editor} />
            </Select.Media>
          </Select.Item>
        )}
        {editors.map(({ id, name }) => (
          <Select.Item key={id} value={id}>
            <Select.Media>
              <EditorIcon id={id} />
            </Select.Media>
            {name}
          </Select.Item>
        ))}
      </Select.Root>
      <Text variant="meta" color="textDim">
        {status({ loading, error, unavailable, count: editors.length, automatic: editor === null })}
      </Text>
    </Column>
  );
}

function status({
  loading,
  error,
  unavailable,
  count,
  automatic,
}: {
  loading: boolean;
  error: boolean;
  unavailable: boolean;
  count: number;
  automatic: boolean;
}): string {
  if (loading) return 'Looking for editors on the dev server…';
  if (error) return 'Could not reach the dev server. Try refreshing.';
  if (unavailable) return 'This editor is no longer available. Choose another.';
  if (count === 0)
    return 'No editor commands found on the dev server. Install a command-line launcher, then refresh.';
  if (automatic) return 'Uses your running editor or the dev server’s default.';
  return 'Detected on the machine running the dev server.';
}
