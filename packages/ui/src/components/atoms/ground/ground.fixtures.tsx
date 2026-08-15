import { Button } from '#ui/components/atoms/button';

import { Surface } from '#ui/components/atoms/surface';

import { Text } from '#ui/components/atoms/text';

import { tintGradient } from '#ui/components/molecules/media-card';

export const TINT = tintGradient(['#3A2E4F', '#1B1524']);

export function Card({ title, note }: Readonly<{ title: string; note: string }>) {
  return (
    <Surface gap={12}>
      <Text variant="label">{title}</Text>
      <Text variant="meta" color="textMuted">
        {note}
      </Text>
      <Button size="sm" label="Play" icon="player-play" />
    </Surface>
  );
}
