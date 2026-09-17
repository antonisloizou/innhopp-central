import { useEffect } from 'react';

/** Locks the document behind an overlay without changing the body's layout or background. */
export function usePreserveOverlayScroll() {
  useEffect(() => {
    const scrollY = window.scrollY;
    const { style } = document.documentElement;
    const previousStyles = {
      overflow: style.overflow,
      overscrollBehavior: style.overscrollBehavior
    };

    // The backdrop already intercepts pointer input. Lock the root scroller,
    // rather than fixing the body, so fixed body backgrounds retain their
    // normal viewport-relative rendering.
    style.overflow = 'hidden';
    style.overscrollBehavior = 'none';

    return () => {
      style.overflow = previousStyles.overflow;
      style.overscrollBehavior = previousStyles.overscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, []);
}
