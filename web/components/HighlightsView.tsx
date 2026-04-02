'use client';

import { useCallback, useEffect, useState } from 'react';
import type { JournalCard, JournalDay } from '../../shared/journal';
import type { HighlightSuggestion } from '../lib/local-store';

const STORAGE_KEY = 'poke-highlights';

type HighlightState = {
  confirmed: string[];
  dismissed: string[];
};

function loadHighlightState(): HighlightState {
  if (typeof window === 'undefined') return { confirmed: [], dismissed: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { confirmed: [], dismissed: [] };
}

function saveHighlightState(state: HighlightState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function findCard(days: JournalDay[], cardId: string): JournalCard | undefined {
  for (const day of days) {
    const card = day.cards.find((c) => c.id === cardId);
    if (card) return card;
  }
  return undefined;
}

export function HighlightsView({
  days,
  suggestions,
}: {
  days: JournalDay[];
  suggestions: HighlightSuggestion[];
}) {
  const [state, setState] = useState<HighlightState>(() => loadHighlightState());

  useEffect(() => {
    saveHighlightState(state);
  }, [state]);

  const confirm = useCallback((cardId: string) => {
    setState((prev) => ({
      ...prev,
      confirmed: prev.confirmed.includes(cardId) ? prev.confirmed : [...prev.confirmed, cardId],
      dismissed: prev.dismissed.filter((id) => id !== cardId),
    }));
  }, []);

  const dismiss = useCallback((cardId: string) => {
    setState((prev) => ({
      ...prev,
      dismissed: prev.dismissed.includes(cardId) ? prev.dismissed : [...prev.dismissed, cardId],
      confirmed: prev.confirmed.filter((id) => id !== cardId),
    }));
  }, []);

  const confirmedHighlights = state.confirmed
    .map((cardId) => {
      const card = findCard(days, cardId);
      const suggestion = suggestions.find((s) => s.cardId === cardId);
      return card ? { card, reason: suggestion?.reason ?? '' } : null;
    })
    .filter(Boolean) as Array<{ card: JournalCard; reason: string }>;

  const pendingSuggestions = suggestions
    .filter((s) => !state.confirmed.includes(s.cardId) && !state.dismissed.includes(s.cardId))
    .map((s) => {
      const card = findCard(days, s.cardId);
      return card ? { card, reason: s.reason, cardId: s.cardId } : null;
    })
    .filter(Boolean) as Array<{ card: JournalCard; reason: string; cardId: string }>;

  return (
    <section className="highlights">
      <header className="highlights__header">
        <div>
          <p className="eyebrow">Highlights and Bangers</p>
          <h2>High-signal interactions</h2>
        </div>
      </header>

      {pendingSuggestions.length > 0 && (
        <div className="highlights__pending">
          <p className="highlights__section-label">Suggested</p>
          <div className="highlights__grid">
            {pendingSuggestions.map(({ card, reason, cardId }) => (
              <article key={cardId} className="highlight-card highlight-card--pending">
                <div className="highlight-card__header">
                  <h3>{card.title}</h3>
                  <span className="highlight-card__day">{card.dayKey}</span>
                </div>
                <p>{card.summary}</p>
                <p className="highlight-card__reason">{reason}</p>
                <div className="highlight-card__actions">
                  <button type="button" className="card-action-btn highlight-btn--confirm" onClick={() => confirm(cardId)}>
                    keep
                  </button>
                  <button type="button" className="card-action-btn" onClick={() => dismiss(cardId)}>
                    dismiss
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {confirmedHighlights.length > 0 ? (
        <div className="highlights__confirmed">
          <p className="highlights__section-label">Confirmed</p>
          <div className="highlights__grid">
            {confirmedHighlights.map(({ card, reason }) => (
              <article key={card.id} className="highlight-card">
                <div className="highlight-card__header">
                  <h3>{card.title}</h3>
                  <span className="highlight-card__day">{card.dayKey}</span>
                </div>
                <p>{card.summary}</p>
                {reason && <p className="highlight-card__reason">{reason}</p>}
              </article>
            ))}
          </div>
        </div>
      ) : pendingSuggestions.length === 0 ? (
        <p className="highlights__empty">No highlights yet. Run the highlights batch to get suggestions.</p>
      ) : null}
    </section>
  );
}
