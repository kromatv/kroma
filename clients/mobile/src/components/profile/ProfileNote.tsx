import { styles, Text, useStyles } from '@kromatv/ui/kit';
import { type } from '#mobile/lib/theme';

export type Note = { text: string; ok: boolean } | null;

export function ProfileNote({ note }: Readonly<{ note: Note }>) {
  const s = useStyles(sDefinition);

  if (!note) return null;
  return <Text style={[s.message, note.ok ? s.messageOk : s.messageBad]}>{note.text}</Text>;
}

const sDefinition = styles({
  message: { ...type.caption, textAlign: 'center' },
  messageOk: { color: 'accentText' },
  messageBad: { color: 'danger' },
});
