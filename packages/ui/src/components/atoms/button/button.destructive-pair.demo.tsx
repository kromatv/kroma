import { Box } from '#ui/components/atoms/box';
import { Button } from './button';

/**
 * How a dangerous action is presented: cancel stays calm and reachable, the
 * destructive one is labelled with what it actually destroys. The safe way out
 * is the wide, quiet one, and `danger` is never the button under the thumb by
 * default.
 *
 * @name Destructive pair
 */
export default function DestructivePair() {
  return (
    <Box row gap={10}>
      <Button variant="ghost" label="Cancel" />
      <Button variant="danger" icon="trash" label="Delete for everyone" />
    </Box>
  );
}
