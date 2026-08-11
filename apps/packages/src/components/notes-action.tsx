import { useState } from 'react';
import { NotesBody } from '#site/components/notes-body';
import type { Release } from '#site/lib/release';
import { Row } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Dialog } from '#ui/components/organisms/dialog';

export function NotesAction({ release }: Readonly<{ release: Release }>) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <Button variant="ghost" size="sm" icon="notes" label="Notes" onPress={() => setOpen(true)} />
      {open ? (
        <Dialog
          open
          onClose={close}
          title={release.version}
          width={760}
          footer={
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
          }
        >
          <NotesBody notes={release.notes} />
        </Dialog>
      ) : null}
    </>
  );
}
