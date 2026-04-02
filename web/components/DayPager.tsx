'use client';

import { useMemo, useState } from 'react';
import type { JournalDay } from '../../shared/journal';
import { BoardView } from './BoardView';

export function DayPager({ days }: { days: JournalDay[] }) {
  const [index, setIndex] = useState(Math.max(0, days.length - 1));
  const day = days[index];

  const canGoBack = index > 0;
  const canGoForward = index < days.length - 1;
  const header = useMemo(() => day?.dayKey ?? 'No day selected', [day]);

  if (!day) {
    return <p>No journal data yet.</p>;
  }

  return (
    <section className="pager">
      <header className="pager__header">
        <div>
          <p className="eyebrow">Pages</p>
          <h2>{header}</h2>
        </div>
        <div className="pager__controls">
          <button type="button" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={!canGoBack}>
            Previous day
          </button>
          <button type="button" onClick={() => setIndex((current) => Math.min(days.length - 1, current + 1))} disabled={!canGoForward}>
            Next day
          </button>
        </div>
      </header>

      <BoardView day={day} />
    </section>
  );
}
