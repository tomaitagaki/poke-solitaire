'use client';

import { useCallback, useEffect, useState } from 'react';
import type { JournalCard } from '../../shared/journal';

export type Position = { x: number; y: number };

export type CanvasState = {
  positions: Record<string, Position>;
  archived: string[];
  labels: Record<string, string[]>;
  merges: Record<string, string[]>;
};

const STORAGE_PREFIX = 'poke-canvas-';

function storageKey(dayKey: string): string {
  return `${STORAGE_PREFIX}${dayKey}`;
}

function loadState(dayKey: string): CanvasState {
  if (typeof window === 'undefined') return { positions: {}, archived: [], labels: {}, merges: {} };
  try {
    const raw = localStorage.getItem(storageKey(dayKey));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { positions: {}, archived: [], labels: {}, merges: {} };
}

function saveState(dayKey: string, state: CanvasState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(dayKey), JSON.stringify(state));
}

const CARD_WIDTH = 300;
const CARD_GAP = 14;
const COLUMN_GAP = 14;
const HEADER_OFFSET = 0;

export function computeSolitaireLayout(cards: JournalCard[], containerWidth: number): Record<string, Position> {
  const cols = Math.max(1, Math.floor((containerWidth + COLUMN_GAP) / (CARD_WIDTH + COLUMN_GAP)));
  const positions: Record<string, Position> = {};
  const columnHeights = new Array(cols).fill(HEADER_OFFSET);

  for (const card of cards) {
    const col = columnHeights.indexOf(Math.min(...columnHeights));
    positions[card.id] = {
      x: col * (CARD_WIDTH + COLUMN_GAP),
      y: columnHeights[col],
    };
    columnHeights[col] += 320 + CARD_GAP;
  }

  return positions;
}

const EMPTY_STATE: CanvasState = { positions: {}, archived: [], labels: {}, merges: {} };

export function useCanvasState(dayKey: string, cards: JournalCard[], containerWidth: number) {
  const [state, setState] = useState<CanvasState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadState(dayKey));
    setHydrated(true);
  }, [dayKey]);

  useEffect(() => {
    if (hydrated) saveState(dayKey, state);
  }, [dayKey, state, hydrated]);

  // Always start from solitaire layout, then overlay any saved positions
  const solitairePositions = computeSolitaireLayout(cards, containerWidth);
  const positions = { ...solitairePositions, ...state.positions };

  const moveCard = useCallback((cardId: string, pos: Position) => {
    setState((prev) => ({
      ...prev,
      positions: { ...prev.positions, [cardId]: pos },
    }));
  }, []);

  const resetLayout = useCallback(() => {
    const fresh = computeSolitaireLayout(cards, containerWidth);
    setState((prev) => ({ ...prev, positions: fresh }));
  }, [cards, containerWidth]);

  const archiveCard = useCallback((cardId: string) => {
    setState((prev) => ({
      ...prev,
      archived: prev.archived.includes(cardId) ? prev.archived : [...prev.archived, cardId],
    }));
  }, []);

  const unarchiveCard = useCallback((cardId: string) => {
    setState((prev) => ({
      ...prev,
      archived: prev.archived.filter((id) => id !== cardId),
    }));
  }, []);

  const addLabel = useCallback((cardId: string, label: string) => {
    setState((prev) => {
      const existing = prev.labels[cardId] ?? [];
      if (existing.includes(label)) return prev;
      return { ...prev, labels: { ...prev.labels, [cardId]: [...existing, label] } };
    });
  }, []);

  const removeLabel = useCallback((cardId: string, label: string) => {
    setState((prev) => {
      const existing = prev.labels[cardId] ?? [];
      return { ...prev, labels: { ...prev.labels, [cardId]: existing.filter((l) => l !== label) } };
    });
  }, []);

  const mergeCards = useCallback((targetId: string, sourceId: string) => {
    setState((prev) => {
      const existing = prev.merges[targetId] ?? [];
      if (existing.includes(sourceId)) return prev;
      return { ...prev, merges: { ...prev.merges, [targetId]: [...existing, sourceId] } };
    });
  }, []);

  return {
    positions,
    archived: state.archived,
    labels: state.labels,
    merges: state.merges,
    moveCard,
    resetLayout,
    archiveCard,
    unarchiveCard,
    addLabel,
    removeLabel,
    mergeCards,
  };
}
