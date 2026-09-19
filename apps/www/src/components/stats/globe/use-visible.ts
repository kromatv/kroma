import { type RefObject, useEffect, useState } from 'react';

/** Whether the element is on screen, so a globe scrolled away stops drawing. */
export function useVisible(target: RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry?.isIntersecting ?? true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);

  return visible;
}
