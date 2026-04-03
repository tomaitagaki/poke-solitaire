/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD: Page Flip (simultaneous)
 *
 * Navigate previous (←):
 *    0ms   page slides right 60px + fades + blurs out
 *    0ms   content swaps instantly (hidden behind blur)
 *  250ms   page slides back to center + fades + sharpens in
 *
 * Navigate next (→): mirror — slides left
 * Reduced-motion: instant swap.
 * ───────────────────────────────────────────────────────── */

'use client';

import { useCallback, useRef, useState } from 'react';
import type { JournalDay } from '../../shared/journal';
import { BoardView } from './BoardView';

const FLIP = {
  duration: 250,
  distance: 60,
  blur: 8,
};

function formatDay(dayKey: string): string {
  const d = new Date(dayKey + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function DayPager({ days }: { days: JournalDay[] }) {
  const [index, setIndex] = useState(Math.max(0, days.length - 1));
  const [exiting, setExiting] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const day = days[index];
  const animating = exiting || direction !== null;

  const flip = useCallback((dir: 'prev' | 'next') => {
    if (animating) return;
    const nextIndex = dir === 'prev'
      ? Math.max(0, index - 1)
      : Math.min(days.length - 1, index + 1);
    if (nextIndex === index) return;

    const slideDir = dir === 'prev' ? 'right' : 'left';
    setDirection(slideDir);
    setExiting(true);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      // Swap content while blurred/faded — user can't see the switch
      setIndex(nextIndex);
      setExiting(false);
      setDirection(null);
    }, FLIP.duration);
  }, [animating, index, days.length]);

  if (!day) {
    return <p>No journal data yet.</p>;
  }

  const isSliding = exiting && direction;
  const flipStyle: React.CSSProperties = isSliding
    ? {
        transform: `translateX(${direction === 'left' ? -FLIP.distance : FLIP.distance}px)`,
        opacity: 0,
        filter: `blur(${FLIP.blur}px)`,
      }
    : {
        transform: 'translateX(0)',
        opacity: 1,
        filter: 'blur(0px)',
      };

  return (
    <section className="pager">
      <header className="pager__header">
        <h2 className="pager__title" style={{ opacity: isSliding ? 0 : 1, filter: isSliding ? 'blur(4px)' : 'blur(0px)' }}>
          {formatDay(day.dayKey)}
        </h2>
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
