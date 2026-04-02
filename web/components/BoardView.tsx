'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import type { JournalCard, JournalDay } from '../../shared/journal';
import { useCanvasState, computeSolitaireLayout, type Position } from '../lib/use-canvas-state';
import { CardStack } from './CardStack';

const CARD_WIDTH = 320;
const CANVAS_MIN_HEIGHT = 600;
const ARCHIVE_PADDING = 16;

function DraggableCard({
  card,
  position,
  isArchived,
  userLabels,
  onArchive,
  onUnarchive,
  onAddLabel,
  onRemoveLabel,
}: {
  card: JournalCard;
  position: Position;
  isArchived: boolean;
  userLabels: string[];
  onArchive: () => void;
  onUnarchive: () => void;
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
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.85 : isArchived ? 0.55 : 1,
    scale: isArchived ? '0.75' : '1',
    transition: isDragging ? 'none' : 'opacity 0.2s, scale 0.2s',
    cursor: 'grab',
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <CardStack
        card={card}
        isArchived={isArchived}
        userLabels={userLabels}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        onAddLabel={onAddLabel}
        onRemoveLabel={onRemoveLabel}
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
    moveCard,
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

  // Separate active and archived cards
  const activeCards = effectiveCards.filter((c) => !archived.includes(c.id));
  const archivedCards = effectiveCards.filter((c) => archived.includes(c.id));

  // Compute archive pile position (bottom-right)
  const archiveBaseX = Math.max(0, containerWidth - CARD_WIDTH - ARCHIVE_PADDING);
  const archiveBaseY = CANVAS_MIN_HEIGHT - 160;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;
    const cardId = active.id as string;
    const currentPos = positions[cardId];
    if (!currentPos) return;

    // Check if dropped on another card for merge
    if (over && over.id !== active.id) {
      const confirmed = window.confirm(`Merge "${activeCards.find(c => c.id === active.id)?.title}" into "${activeCards.find(c => c.id === over.id)?.title}"?`);
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

      <div ref={measureRef} className="board__canvas" style={{ minHeight: CANVAS_MIN_HEIGHT }}>
        {mounted && (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            {activeCards.map((card) => (
              <DraggableCard
                key={card.id}
                card={card}
                position={positions[card.id] ?? { x: 0, y: 0 }}
                isArchived={false}
                userLabels={labels[card.id] ?? []}
                onArchive={() => archiveCard(card.id)}
                onUnarchive={() => {}}
                onAddLabel={(label) => addLabel(card.id, label)}
                onRemoveLabel={(label) => removeLabel(card.id, label)}
              />
            ))}
            {archivedCards.map((card, i) => (
              <DraggableCard
                key={card.id}
                card={card}
                position={{
                  x: archiveBaseX + i * 6,
                  y: archiveBaseY + i * 6,
                }}
                isArchived={true}
                userLabels={labels[card.id] ?? []}
                onArchive={() => {}}
                onUnarchive={() => unarchiveCard(card.id)}
                onAddLabel={(label) => addLabel(card.id, label)}
                onRemoveLabel={(label) => removeLabel(card.id, label)}
              />
            ))}
          </DndContext>
        )}
      </div>
    </section>
  );
}
