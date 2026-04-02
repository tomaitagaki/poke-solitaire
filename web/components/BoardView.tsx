'use client';

import type { JournalDay } from '../../shared/journal';
import { CardStack } from './CardStack';

export function BoardView({ day }: { day: JournalDay }) {
  return (
    <section className="board">
      <header className="board__header">
        <div>
          <p className="eyebrow">Solitaire board</p>
          <h2>{day.dayKey}</h2>
        </div>
        <p className="board__subcopy">A single day of stacked atomic threads.</p>
      </header>

      <div className="board__stacks">
        {day.cards.map((card) => (
          <CardStack key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}
