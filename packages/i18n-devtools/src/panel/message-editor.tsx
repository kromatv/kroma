import {
  Callout,
  Column,
  Icon,
  IconButton,
  Row,
  Surface,
  Text,
  styles,
  useStyles,
} from '@kromatv/ui/kit';
import type { MessageTarget } from '../overlay/message-target';
import { useMessage } from '../server/message';
import { GRIP_DATA } from './drag';
import { MessageForm } from './message-form';

export interface MessageEditorProps {
  target: MessageTarget;
  onClose: () => void;
  onSaved: () => void;
}

/** The window a message is rewritten in: its key, where it is kept, and the
 *  form once the dev server has read it off the catalogs. It takes the panel's
 *  place and drags by the same grip. */
export function MessageEditor({ target, onClose, onSaved }: Readonly<MessageEditorProps>) {
  const s = useStyles(editorStyles);
  const loaded = useMessage(target);
  return (
    <Surface tone="raised" pad="none" p={16} elevated gap={12} style={s.editor}>
      <Row between gap={8}>
        <Row gap={8} dataSet={GRIP_DATA} style={s.grip}>
          <Icon name="grip-vertical" size={16} color="textDim" />
          <Text variant="label">Edit message</Text>
        </Row>
        <IconButton icon="x" label="Close" control="sm" variant="ghost" onPress={onClose} />
      </Row>
      <Column gap={2}>
        <Text variant="meta" font="mono" color="text" lines={2}>
          {target.key}
        </Text>
        <Text variant="meta" color="textDim">
          {`${target.scope ?? 'core'}@${target.locale}`}
        </Text>
      </Column>
      {loaded.state === 'loading' && (
        <Text variant="meta" color="textMuted">
          Reading the catalog…
        </Text>
      )}
      {loaded.state === 'refused' && (
        <Callout.Root tone="danger" size="sm">
          <Callout.Title>{loaded.reason}</Callout.Title>
        </Callout.Root>
      )}
      {loaded.state === 'ready' && (
        <MessageForm target={target} message={loaded.message} onClose={onClose} onSaved={onSaved} />
      )}
    </Surface>
  );
}

const editorStyles = styles({
  editor: {
    w: 360,
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'calc(100dvh - 32px)',
    overflowY: 'auto',
    shadow: 'card',
  },
  grip: { grow: 1, shrink: 1, minW: 0, cursor: 'move', touchAction: 'none', userSelect: 'none' },
});
