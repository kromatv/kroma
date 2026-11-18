import { useState } from 'react';
import type { MovieView } from '#web/shared/lib/api';

/** The title a viewing opened with. A refetched copy of the same id, which
 * carries fresh ticketed URLs, keeps the one it opened with; another id
 * replaces it. */
export function useTitleAsOpened(latest: MovieView): MovieView {
  const [opened, setOpened] = useState(latest);
  if (opened.id !== latest.id) {
    setOpened(latest);
    return latest;
  }
  return opened;
}
