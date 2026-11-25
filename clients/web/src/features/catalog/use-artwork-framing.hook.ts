import type { ArtRole } from '@kromatv/client/media';
import type { CropTransform } from '@kromatv/ui/kit';
import { useEffect, useState } from 'react';

const UNTOUCHED: CropTransform = { zoom: 1, x: 0, y: 0, rotation: 0 };

/** A picture picked for one of a title's slots, held while it is framed. */
export interface ArtworkFraming {
  role: ArtRole;
  file: File;
  src: string;
}

/** The picture being framed, if any, and where it sits behind the frame. A
 * picture starts centred, and its object URL is let go once it is dropped or
 * the dialog closes. */
export function useArtworkFraming() {
  const [framing, setFraming] = useState<ArtworkFraming | null>(null);
  const [transform, setTransform] = useState<CropTransform>(UNTOUCHED);
  useEffect(
    () => () => {
      if (framing) {
        URL.revokeObjectURL(framing.src);
      }
    },
    [framing],
  );
  return {
    framing,
    transform,
    setTransform,
    begin: (role: ArtRole, file: File) => {
      setTransform(UNTOUCHED);
      setFraming({ role, file, src: URL.createObjectURL(file) });
    },
    end: () => setFraming(null),
  };
}
