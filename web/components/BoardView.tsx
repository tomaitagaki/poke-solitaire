'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import type { JournalCard, JournalDay } from '../../shared/journal';
import { useCanvasState, type Position } from '../lib/use-canvas-state';
import { CardStack } from './CardStack';
import { MergeDialog } from './MergeDialog';

const CARD_WIDTH = 300;

function DraggableCard({
  card,
  position,
  zIndex,
  userLabels,
  onArchive,
  onBringToFront,
  onSplitAt,
  onAddLabel,
  onRemoveLabel,
}: {
  card: JournalCard;
  position: Position;
  zIndex: number;
  userLabels: string[];
  onArchive: () => void;
  onBringToFront: () => void;
  onSplitAt: (messageIds: string[]) => void;
  onAddLabel: (label: string) => void;
  onRemoveLabel: (label: string) => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: card.id,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: card.id,
  });

  const combinedRef = useCallback((node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  }, [setDragRef, setDropRef]);

  const showGlow = isOver && !isDragging;

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
    <div ref={combinedRef} style={style} {...listeners} {...attributes}>
      <div className={`card-glow-wrap ${showGlow ? 'card-glow-wrap--active' : ''}`}>
        <CardStack
          card={card}
          userLabels={userLabels}
          onArchive={onArchive}
          onBringToFront={onBringToFront}
          onSplitAt={onSplitAt}
          onAddLabel={onAddLabel}
          onRemoveLabel={onRemoveLabel}
          isDragging={isDragging}
        />
      </div>
    </div>
  );
}

export function BoardView({ day, onResetLayout }: { day: JournalDay; onResetLayout?: (fn: () => void) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [mergePrompt, setMergePrompt] = useState<{ sourceId: string; targetId: string } | null>(null);

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

  useEffect(() => {
    onResetLayout?.(() => resetLayout);
  }, [onResetLayout, resetLayout]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

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

  // Pending merge delta — store so we can move the card if merge is cancelled
  const pendingDelta = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;
    const cardId = active.id as string;
    const currentPos = positions[cardId];
    if (!currentPos) return;

    if (over && over.id !== active.id) {
      pendingDelta.current = delta;
      setMergePrompt({ sourceId: cardId, targetId: over.id as string });
      return;
    }

    moveCard(cardId, {
      x: Math.max(0, Math.min(containerWidth - CARD_WIDTH, currentPos.x + delta.x)),
      y: Math.max(0, currentPos.y + delta.y),
    });
  }

  function handleMergeConfirm() {
    if (!mergePrompt) return;
    mergeCards(mergePrompt.targetId, mergePrompt.sourceId);
    setMergePrompt(null);
  }

  function handleMergeCancel() {
    if (!mergePrompt) return;
    // Move the card to where it was dropped instead of snapping back
    const currentPos = positions[mergePrompt.sourceId];
    if (currentPos) {
      moveCard(mergePrompt.sourceId, {
        x: Math.max(0, currentPos.x + pendingDelta.current.x),
        y: Math.max(0, currentPos.y + pendingDelta.current.y),
      });
    }
    setMergePrompt(null);
  }

  const sourceCard = mergePrompt ? activeCards.find(c => c.id === mergePrompt.sourceId) : null;
  const targetCard = mergePrompt ? activeCards.find(c => c.id === mergePrompt.targetId) : null;

  return (
    <section className="board">
      <div ref={measureRef} className="board__canvas">
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
                onBringToFront={() => bringToFront(card.id)}
                onSplitAt={async (messageIds) => {
                  try {
                    const res = await fetch('/api/split', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ cardId: card.id, messageIds }),
                    });
                    const data = await res.json();
                    if (data.ok) window.location.reload();
                    else console.error('Split failed:', data.error);
                  } catch (e) {
                    console.error('Split failed:', e);
                  }
                }}
                onAddLabel={(label) => { bringToFront(card.id); addLabel(card.id, label); }}
                onRemoveLabel={(label) => removeLabel(card.id, label)}
              />
            ))}
          </DndContext>
        )}
      </div>

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

      {mergePrompt && sourceCard && targetCard && (
        <MergeDialog
          sourceTitle={sourceCard.title}
          targetTitle={targetCard.title}
          onConfirm={handleMergeConfirm}
          onCancel={handleMergeCancel}
        />
      )}
    </section>
  );
}
