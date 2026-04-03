/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD: Page Flip
 *
 * Navigate previous (←):
 *    0ms   current page exits → slides right + fades out
 *    0ms   new page enters ← slides in from left + fades in
 *  300ms   settled
 *
 * Navigate next (→):
 *    0ms   current page exits ← slides left + fades out
 *    0ms   new page enters → slides in from right + fades in
 *  300ms   settled
 *
 * Like turning a physical journal page.
 * CSS-only via transition on transform + opacity.
 * Reduced-motion: instant swap, no slide.
 * ───────────────────────────────────────────────────────── */

'use client';

import { useCallback, useRef, useState } from 'react';
import type { JournalDay } from '../../shared/journal';
import { BoardView } from './BoardView';

/* ── Config ── */
const FLIP = {
  duration:  300,     // ms for the full transition
  distance:  60,      // px the page slides
};

function formatDay(dayKey: string): string {
  const d = new Date(dayKey + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

type FlipDirection = 'left' | 'right' | null;

export function DayPager({ days }: { days: JournalDay[] }) {
  const [index, setIndex] = useState(Math.max(0, days.length - 1));
  const [flipDir, setFlipDir] = useState<FlipDirection>(null);
  const [animating, setAnimating] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const day = days[index];

  const flip = useCallback((direction: 'prev' | 'next') => {
    if (animating) return;
    const nextIndex = direction === 'prev'
      ? Math.max(0, index - 1)
      : Math.min(days.length - 1, index + 1);
    if (nextIndex === index) return;

    // Exit: current page slides away in the flip direction
    setFlipDir(direction === 'prev' ? 'right' : 'left');
    setAnimating(true);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // At halfway, swap content and enter from opposite side
    timeoutRef.current = setTimeout(() => {
      setIndex(nextIndex);
      setFlipDir(direction === 'prev' ? 'left' : 'right');

      // Tiny frame delay to let the browser paint the new position before transitioning
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFlipDir(null);
          setTimeout(() => setAnimating(false), FLIP.duration / 2);
        });
      });
    }, FLIP.duration / 2);
  }, [animating, index, days.length]);

  if (!day) {
    return <p>No journal data yet.</p>;
  }

  const flipStyle: React.CSSProperties = flipDir === 'left'
    ? { transform: `translateX(-${FLIP.distance}px)`, opacity: 0 }
    : flipDir === 'right'
    ? { transform: `translateX(${FLIP.distance}px)`, opacity: 0 }
    : { transform: 'translateX(0)', opacity: 1 };

  return (
    <section className="pager">
      <header className="pager__header">
        <h2 className="pager__title" style={{ opacity: flipDir ? 0 : 1 }}>{formatDay(day.dayKey)}</h2>
        <div className="pager__controls">
          <button
            type="button"
            onClick={() => flip('prev')}
            disabled={index <= 0 || animating}
            aria-label="Previous day"
          >
            &larr;
          </button>
          <button
            type="button"
            onClick={() => flip('next')}
            disabled={index >= days.length - 1 || animating}
            aria-label="Next day"
          >
            &rarr;
          </button>
        </div>
      </header>

      <div className="pager__page" style={flipStyle}>
        <BoardView day={day} />
      </div>
    </section>
  );
}
