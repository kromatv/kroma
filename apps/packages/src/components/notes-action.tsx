import { Row } from '@kroma/ui/kit/atoms/box';
import { Button } from '@kroma/ui/kit/atoms/button';
import { Dialog } from '@kroma/ui/kit/organisms/dialog';
import { useState } from 'react';
import { NotesBody } from '#site/components/notes-body';
import type { Release } from '#site/lib/release';

export function NotesAction({ release }: Readonly<{ release: Release }>) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <Button variant="ghost" size="sm" icon="notes" label="Notes" onPress={() => setOpen(true)} />
      {open ? (
        <Dialog.Root open onClose={close} title={release.version} width={760}>
          <NotesBody notes={release.notes} />
          <Dialog.Footer>
            <Row gap={10} justify="flex-end">
              <Button variant="ghost" size="sm" label="Close" onPress={close} />
              <Button
                variant="primary"
                size="sm"
                icon="brand-github"
                href={release.release}
                label="View on GitHub"
              />
            </Row>
          </Dialog.Footer>
        </Dialog.Root>
      ) : null}
    </>
  );
}
