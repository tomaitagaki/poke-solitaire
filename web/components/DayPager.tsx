'use client';

import { useState } from 'react';
import type { JournalDay } from '../../shared/journal';
import { BoardView } from './BoardView';

function formatDay(dayKey: string): string {
  const d = new Date(dayKey + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function DayPager({ days }: { days: JournalDay[] }) {
  const [index, setIndex] = useState(Math.max(0, days.length - 1));
  const day = days[index];

  if (!day) {
    return <p>No journal data yet.</p>;
  }

  return (
    <section className="pager">
      <header className="pager__header">
        <h2>{formatDay(day.dayKey)}</h2>
        <div className="pager__controls">
          <button
            type="button"
            onClick={() => setIndex((c) => Math.max(0, c - 1))}
            disabled={index <= 0}
            aria-label="Previous day"
          >
            &larr;
          </button>
          <button
            type="button"
            onClick={() => setIndex((c) => Math.min(days.length - 1, c + 1))}
            disabled={index >= days.length - 1}
            aria-label="Next day"
          >
            &rarr;
          </button>
        </div>
      </header>

      <BoardView day={day} />
    </section>
  );
}
