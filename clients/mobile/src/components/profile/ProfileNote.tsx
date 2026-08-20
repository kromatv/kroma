import { styles, Text } from '@kroma/ui/kit';
import { type } from '#mobile/lib/theme';

export type Note = { text: string; ok: boolean } | null;

export function ProfileNote({ note }: Readonly<{ note: Note }>) {
  if (!note) return null;
  return <Text style={[s.message, note.ok ? s.messageOk : s.messageBad]}>{note.text}</Text>;
}

const s = styles({
  message: { ...type.caption, textAlign: 'center' },
  messageOk: { color: 'accentText' },
  messageBad: { color: 'danger' },
});
