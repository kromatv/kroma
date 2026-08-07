// Right-hand slide-in panel on Radix Dialog: portalled to the body,
// scroll-locked, focus-trapped, Esc/outside-click dismiss, with its own
// enter/exit transition. The panel stays mounted while `open` is false so the
// exit can play; with a react-call callable, pass `open={!call.ended}` and
// give `createCallable` an unmount delay matching the 300ms transition.

import * as Dialog from '@radix-ui/react-dialog';
import { type ReactNode, useEffect, useState } from 'react';

export function Drawer({
  open,
  onClose,
  title,
  width = 460,
  children,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  /** Accessible name only (sr-only): the visible header is the caller's. */
  title: string;
  width?: number;
  children: ReactNode;
}>) {
  // Mount at the off-screen transform, flip on the next frame so the enter
  // transition plays.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const shown = entered && open;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal forceMount>
        <Dialog.Overlay
          forceMount
          className={`fixed inset-0 z-60 bg-[rgba(4,4,6,.6)] backdrop-blur-[2px] transition-opacity ${shown ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        />
        <Dialog.Content
          forceMount
          asChild
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <aside
            className="fixed right-0 top-0 z-61 flex h-screen max-w-full flex-col border-l border-white/9 bg-[#0E0E12] shadow-[-20px_0_60px_rgba(0,0,0,.6)] transition-transform duration-300 ease-out focus:outline-none sm:max-w-[92vw]"
            style={{ width, transform: shown ? 'translateX(0)' : 'translateX(105%)' }}
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            {children}
          </aside>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
