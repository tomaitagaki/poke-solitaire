'use client';

import type { JournalCard } from '../../shared/journal';

export function CardStack({ card }: { card: JournalCard }) {
  return (
    <article className="card-stack">
      <div className="card-stack__header">
        <div>
          <p className="eyebrow">{card.state}</p>
          <h3>{card.title}</h3>
        </div>
        <div className="tempo-chip">
          {card.tempo.label} · {card.tempo.messageCount} msgs
        </div>
      </div>
      <p className="card-stack__summary">{card.summary}</p>
      <div className="card-stack__meta">
        <span>{card.interactionCount} interactions</span>
        <span>{card.dayKey}</span>
      </div>
    </article>
  );
}
