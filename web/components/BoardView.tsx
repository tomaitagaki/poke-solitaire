'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import type { JournalCard, JournalDay } from '../../shared/journal';
import { useCanvasState, type Position } from '../lib/use-canvas-state';
import { CardStack } from './CardStack';

const CARD_WIDTH = 300;
const CANVAS_PADDING_BOTTOM = 40;

function DraggableCard({
  card,
  position,
  zIndex,
  userLabels,
  onArchive,
  onAddLabel,
  onRemoveLabel,
}: {
  card: JournalCard;
  position: Position;
  zIndex: number;
  userLabels: string[];
  onArchive: () => void;
  onAddLabel: (label: string) => void;
  onRemoveLabel: (label: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });

  const style: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    width: CARD_WIDTH,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 100 : zIndex,
    opacity: isDragging ? 0.85 : 1,
    transition: isDragging ? 'none' : 'opacity 200ms cubic-bezier(0.165, 0.84, 0.44, 1)',
    willChange: isDragging ? 'transform' : undefined,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <CardStack
        card={card}
        userLabels={userLabels}
        onArchive={onArchive}
        onAddLabel={onAddLabel}
        onRemoveLabel={onRemoveLabel}
        isDragging={isDragging}
      />
    </div>
  );
}

export function BoardView({ day }: { day: JournalDay }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1060);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      containerRef.current = node;
      setContainerWidth(node.clientWidth);
    }
  }, []);

  const {
    positions,
    archived,
    labels,
    merges,
    interactionOrder,
    moveCard,
    bringToFront,
    resetLayout,
    archiveCard,
    unarchiveCard,
    addLabel,
    removeLabel,
    mergeCards,
  } = useCanvasState(day.dayKey, day.cards, containerWidth);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Build effective cards list (apply merges)
  const mergedSourceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const sources of Object.values(merges)) {
      for (const id of sources) ids.add(id);
    }
    return ids;
  }, [merges]);

  const effectiveCards = useMemo(() => {
    return day.cards.filter((c) => !mergedSourceIds.has(c.id)).map((card) => {
      const mergedIds = merges[card.id];
      if (!mergedIds?.length) return card;
      const mergedCards = day.cards.filter((c) => mergedIds.includes(c.id));
      const allMessages = [...card.messages, ...mergedCards.flatMap((c) => c.messages)]
        .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
      return {
        ...card,
        messages: allMessages,
        messageIds: allMessages.map((m) => m.id),
        interactionCount: allMessages.length,
        tempo: { ...card.tempo, messageCount: allMessages.length },
      };
    });
  }, [day.cards, merges, mergedSourceIds]);

  const activeCards = effectiveCards.filter((c) => !archived.includes(c.id));
  const archivedCards = effectiveCards.filter((c) => archived.includes(c.id));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;
    const cardId = active.id as string;
    const currentPos = positions[cardId];
    if (!currentPos) return;

    if (over && over.id !== active.id) {
      const confirmed = window.confirm(
        `Merge \u201c${activeCards.find(c => c.id === active.id)?.title}\u201d into \u201c${activeCards.find(c => c.id === over.id)?.title}\u201d?`
      );
      if (confirmed) {
        mergeCards(over.id as string, cardId);
        return;
      }
    }

    moveCard(cardId, {
      x: Math.max(0, currentPos.x + delta.x),
      y: Math.max(0, currentPos.y + delta.y),
    });
  }

  return (
    <section className="board">
      <header className="board__header">
        <div>
          <p className="eyebrow">Solitaire board</p>
          <h2>{day.dayKey}</h2>
        </div>
        <div className="board__actions">
          <button type="button" className="board__btn" onClick={resetLayout}>
            Reset layout
          </button>
        </div>
      </header>

      <div ref={measureRef} className="board__canvas" style={{
        minHeight: Math.max(300, ...activeCards.map((c) => (positions[c.id]?.y ?? 0) + 260)) + CANVAS_PADDING_BOTTOM,
      }}>
        {mounted && (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            {activeCards.map((card) => (
              <DraggableCard
                key={card.id}
                card={card}
                position={positions[card.id] ?? { x: 0, y: 0 }}
                zIndex={interactionOrder.indexOf(card.id) + 2}
                userLabels={labels[card.id] ?? []}
                onArchive={() => { bringToFront(card.id); archiveCard(card.id); }}
                onAddLabel={(label) => { bringToFront(card.id); addLabel(card.id, label); }}
                onRemoveLabel={(label) => removeLabel(card.id, label)}
              />
            ))}
          </DndContext>
        )}
      </div>

      {/* ── Dedicated Archive Zone ── */}
      {archivedCards.length > 0 && (
        <div className="board__archive">
          <p className="board__archive-label">Archived</p>
          <div className="board__archive-list">
            {archivedCards.map((card) => (
              <div key={card.id} className="archive-chip">
                <div className="archive-chip__info">
                  <span className="archive-chip__title">{card.title}</span>
                  <span className="archive-chip__meta">
                    {card.tempo.label} &middot; {card.tempo.messageCount} msgs
                  </span>
                </div>
                <button
                  type="button"
                  className="card-action-btn"
                  onClick={() => unarchiveCard(card.id)}
                  aria-label={`Restore ${card.title}`}
                >
                  restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
