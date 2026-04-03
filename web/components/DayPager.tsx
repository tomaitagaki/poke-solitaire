/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD: Page Flip (simultaneous)
 *
 *    0ms   page slides + fades + blurs out
 *    0ms   content swaps (hidden behind blur)
 *  250ms   settled
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
  const [reclustering, setReclustering] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const resetLayoutRef = useRef<(() => void) | null>(null);
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
      setIndex(nextIndex);
      setExiting(false);
      setDirection(null);
    }, FLIP.duration);
  }, [animating, index, days.length]);

  async function handleRecluster() {
    if (!day) return;
    setReclustering(true);
    try {
      const res = await fetch('/api/recluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayKey: day.dayKey }),
      });
      const data = await res.json();
      if (data.ok) window.location.reload();
      else console.error('Recluster failed:', data.error);
    } catch (e) {
      console.error('Recluster failed:', e);
    } finally {
      setReclustering(false);
    }
  }

  async function handleCollect() {
    setCollecting(true);
    try {
      const res = await fetch('/api/collect', { method: 'POST' });
      const data = await res.json();
      if (data.ok) window.location.reload();
      else console.error('Collect failed:', data.error);
    } catch (e) {
      console.error('Collect failed:', e);
    } finally {
      setCollecting(false);
    }
  }

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
        <button
          type="button"
          className="pager__nav"
          onClick={() => flip('prev')}
          disabled={index <= 0 || animating}
          aria-label="Previous day"
        >
          &larr;
        </button>

        <div className="pager__center">
          <h2 className="pager__title" style={{ opacity: isSliding ? 0 : 1, filter: isSliding ? 'blur(4px)' : 'blur(0px)' }}>
            {formatDay(day.dayKey)}
          </h2>
          <div className="pager__actions">
            <button type="button" className="pager__action-btn" onClick={handleCollect} disabled={collecting}>
              {collecting ? 'Syncing\u2026' : 'Sync'}
            </button>
            <button type="button" className="pager__action-btn" onClick={handleRecluster} disabled={reclustering}>
              {reclustering ? 'Clustering\u2026' : 'Recluster'}
            </button>
            <button type="button" className="pager__action-btn" onClick={() => resetLayoutRef.current?.()}>
              Reset
            </button>
          </div>
        </div>

        <button
          type="button"
          className="pager__nav"
          onClick={() => flip('next')}
          disabled={index >= days.length - 1 || animating}
          aria-label="Next day"
        >
          &rarr;
        </button>
      </header>

      <div className="pager__page" style={flipStyle}>
        <BoardView
          day={day}
          onResetLayout={(fn) => { resetLayoutRef.current = fn; }}
        />
      </div>
    </section>
  );
}
