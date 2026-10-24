import { useState, useLayoutEffect, useCallback } from 'react';

const MARGIN = 8; // minimum gap to the viewport edge

/**
 * Viewport-aware placement for popovers (date pickers, action menus).
 *
 * Renders the popover with `position: fixed` next to its anchor, then measures
 * it and flips/clamps so it never leaves the screen:
 *  - horizontally: align to the anchor's left edge (or right edge when
 *    `align: 'end'`), flip to the other edge if it overflows, then clamp.
 *  - vertically: open below; if there's no room, open above; if neither
 *    fits, pin to the viewport and cap the height (the popover scrolls).
 * Re-measures on resize and scroll while open.
 *
 * Usage:
 *   const style = usePopoverPlacement(open, anchorRef, popoverRef, { align: 'end' });
 *   <div ref={popoverRef} style={style}>…</div>
 */
export default function usePopoverPlacement(open, anchorRef, popoverRef, { align = 'start', gap = 8, zIndex = 10001 } = {}) {
  const [style, setStyle] = useState({ position: 'fixed', visibility: 'hidden', zIndex });

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const pop = popoverRef.current;
    if (!anchor || !pop) return;
    const a = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = pop.offsetWidth;
    const h = pop.scrollHeight;

    // Horizontal
    let left = align === 'end' ? a.right - w : a.left;
    if (left + w > vw - MARGIN) left = a.right - w;     // flip to right-aligned
    if (left < MARGIN) left = a.left;                     // flip back to left-aligned
    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - w - MARGIN));

    // Vertical
    const below = a.bottom + gap;
    const above = a.top - gap - h;
    let top;
    let maxHeight;
    if (below + h <= vh - MARGIN) top = below;
    else if (above >= MARGIN) top = above;
    else {
      // Neither side fits: use the roomier side and let the popover scroll
      const roomBelow = vh - below - MARGIN;
      const roomAbove = a.top - gap - MARGIN;
      if (roomBelow >= roomAbove) { top = below; maxHeight = roomBelow; }
      else { top = MARGIN; maxHeight = roomAbove; }
    }

    setStyle({
      position: 'fixed', top, left, zIndex, visibility: 'visible',
      ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}),
    });
  }, [anchorRef, popoverRef, align, gap, zIndex]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle({ position: 'fixed', visibility: 'hidden', zIndex });
      return undefined;
    }
    place();
    // Content (e.g. a calendar) can settle a frame later — measure again
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place, zIndex]);

  return style;
}
