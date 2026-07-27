import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { Button } from './button';

/**
 * The row from a title screen: the primary action, two stateful toggles and a
 * demoted extra. This is the arrangement the design means by "one primary per
 * screen". Press the two `outline` buttons to see the amber `active` fill.
 *
 * @name Detail actions
 */
export default function DetailActions() {
  const [inList, setInList] = useState(false);
  const [watched, setWatched] = useState(false);

  return (
    <Box gap={16} align="flex-start">
      <Box row gap={12} align="center">
        <Button size="tv" icon="player-play-filled" label="Play" />
        <Button
          variant="outline"
          size="tv"
          active={inList}
          icon={inList ? 'check' : 'plus'}
          label="My list"
          onPress={() => setInList((prev) => !prev)}
        />
        <Button
          variant="outline"
          size="tv"
          active={watched}
          icon="eye"
          label="Watched"
          onPress={() => setWatched((prev) => !prev)}
        />
        <Button variant="glass" size="tv" icon="info-circle" label="Details" />
      </Box>
      <Txt variant="meta" color="textDim">
        One primary action, then toggles that read as pressed rather than as commands.
      </Txt>
    </Box>
  );
}
