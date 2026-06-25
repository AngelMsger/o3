import { useEffect, useState } from 'react';

/**
 * Keeps a component mounted through its exit transition so close animates too.
 *
 * Returns:
 *  - `mounted`: render the component while true (stays true through the exit)
 *  - `visible`: drives the enter/exit CSS classes (false → play exit, then unmount)
 *
 * `duration` should match the CSS transition length (defaults to --motion-base = 180ms,
 * with a little slack so the unmount never clips the animation).
 */
export function useDelayedUnmount(
  open: boolean,
  duration = 200,
): { mounted: boolean; visible: boolean } {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Flip to visible on the next frame so the enter transition runs from the
      // closed state (an element mounted already-open won't transition).
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), duration);
    return () => clearTimeout(t);
  }, [open, duration]);

  return { mounted, visible };
}
