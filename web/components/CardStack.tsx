/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD: Card Expand (vertical card fan)
 *
 *    0ms   summary crossfades out
 *   0-50ms messages container appears
 *   80ms   first message fans in (translateY -6px → 0, opacity 0 → 1)
 *  130ms   second message fans in
 *  180ms   third message fans in
 *  ...     (staggered 50ms per message, ease-out-quart)
 *
 * Collapse reverses: messages fade, summary fades back in.
 * Reduced-motion: instant show/hide, no transform.
 * ───────────────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JournalCard } from '../../shared/journal';
import { FittedText } from './FittedText';

/* ── Timing ── */
const TIMING = {
  fanStagger:  50,    // ms between each message appearing
  fanInitial:  80,    // ms before first message appears
  crossfade:   120,   // ms for summary ↔ messages crossfade
};

/* ── Fan config ── */
const FAN = {
  offsetY:   -6,      // px each message slides from
  offsetX:    0,
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

type CardStackProps = {
  card: JournalCard;
  isArchived?: boolean;
  userLabels?: string[];
  onArchive?: () => void;
  onUnarchive?: () => void;
  onAddLabel?: (label: string) => void;
  onRemoveLabel?: (label: string) => void;
  onBringToFront?: () => void;
  onSplitAt?: (messageIds: string[]) => void;
  isDragging?: boolean;
};

export function CardStack({
  card,
  isArchived = false,
  userLabels = [],
  onArchive,
  onUnarchive,
  onAddLabel,
  onRemoveLabel,
  onBringToFront,
  onSplitAt,
  isDragging = false,
}: CardStackProps) {
  const [expanded, setExpanded] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const wasDragging = useRef(false);

  useEffect(() => {
    if (isDragging) wasDragging.current = true;
  }, [isDragging]);

  const toggle = useCallback(() => {
    if (wasDragging.current) { wasDragging.current = false; return; }
    if (!isArchived) {
      setExpanded((prev) => !prev);
      onBringToFront?.();
    }
  }, [isArchived, onBringToFront]);

  /* Stagger the message render slightly after expand triggers */
  useEffect(() => {
    if (expanded) {
      const t = setTimeout(() => setShowMessages(true), 10);
      return () => clearTimeout(t);
    }
    setShowMessages(false);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expanded]);

  function handleAddLabel(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = labelDraft.trim();
    if (trimmed && onAddLabel) {
      onAddLabel(trimmed);
      setLabelDraft('');
      setShowLabelInput(false);
    }
  }

  return (
    <article
      className={`card-stack ${expanded ? 'card-stack--expanded' : ''} ${isArchived ? 'card-stack--archived' : ''}`}
      onClick={toggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && toggle()}
      aria-expanded={expanded}
    >
      <div className="card-stack__header">
        <FittedText as="h3" text={card.title} maxLines={2} maxSize={18} minSize={13} />
        <div className="tempo-chip">
          {card.tempo.messageCount} msgs
        </div>
      </div>

      {userLabels.length > 0 && (
        <div className="card-stack__labels">
          {userLabels.map((label) => (
            <span key={label} className="label-chip">
              {label}
              {onRemoveLabel && (
                <button
                  type="button"
                  className="label-chip__remove"
                  onClick={(e) => { e.stopPropagation(); onRemoveLabel(label); }}
                  aria-label={`Remove label ${label}`}
                >
                  &times;
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="card-stack__body">
        <div className={`card-stack__collapse ${expanded ? 'card-stack__collapse--hidden' : ''}`}>
          <div className="card-stack__collapse-inner">
            <FittedText text={card.summary} maxLines={3} maxSize={14} minSize={12} className="card-stack__summary-text" />
          </div>
        </div>

        <div className={`card-stack__expand ${expanded ? 'card-stack__expand--open' : ''}`}>
          <div className="card-stack__expand-inner">
            <div className={`card-stack__messages ${showMessages ? 'card-stack__messages--visible' : ''}`}>
              {card.messages.map((msg, i) => {
                const isMe = msg.sender === 'me';
                const isSelected = selected.has(i);
                return (
                  <div
                    key={msg.id}
                    className={`card-stack__message ${isMe ? 'card-stack__message--me' : 'card-stack__message--poke'} ${selectMode && isSelected ? 'card-stack__message--selected' : ''}`}
                    style={{
                      '--fan-index': i,
                      '--fan-delay': `${TIMING.fanInitial + i * TIMING.fanStagger}ms`,
                      '--fan-offset-y': `${FAN.offsetY}px`,
                    } as React.CSSProperties}
                    onClick={selectMode ? (e) => {
                      e.stopPropagation();
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      });
                    } : undefined}
                  >
                    {selectMode && (
                      <span className={`select-dot ${isSelected ? 'select-dot--on' : ''}`} />
                    )}
                    <p className="card-stack__message-text">{msg.text}</p>
                    <span className="card-stack__message-time">{formatTime(msg.sentAt)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="card-stack__meta">
        <div className="card-stack__actions" onClick={(e) => e.stopPropagation()}>
          {expanded && onSplitAt && card.messages.length > 1 && !selectMode && (
            <button type="button" className="card-action-btn" onClick={() => { setSelectMode(true); setSelected(new Set()); }}>
              select
            </button>
          )}
          {selectMode && (
            <>
              <button
                type="button"
                className="card-action-btn"
                disabled={selected.size === 0}
                onClick={() => {
                  if (selected.size === 0 || !onSplitAt) return;
                  const ids = [...selected].map((i) => card.messages[i]?.id).filter(Boolean) as string[];
                  onSplitAt(ids);
                  setSelectMode(false);
                  setSelected(new Set());
                }}
              >
                split {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
              <button type="button" className="card-action-btn" onClick={() => { setSelectMode(false); setSelected(new Set()); }}>
                cancel
              </button>
            </>
          )}
          {!selectMode && !isArchived && onArchive && (
            <button type="button" className="card-action-btn" onClick={onArchive} aria-label="Archive this stack">
              archive
            </button>
          )}
          {!selectMode && isArchived && onUnarchive && (
            <button type="button" className="card-action-btn" onClick={onUnarchive} aria-label="Restore this stack">
              restore
            </button>
          )}
          {onAddLabel && !showLabelInput && (
            <button type="button" className="card-action-btn" onClick={() => setShowLabelInput(true)} aria-label="Add label">
              + label
            </button>
          )}
          {showLabelInput && (
            <form onSubmit={handleAddLabel} className="label-input-form">
              <input
                autoFocus
                type="text"
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                placeholder="label"
                className="label-input"
                onBlur={() => { if (!labelDraft.trim()) setShowLabelInput(false); }}
              />
            </form>
          )}
        </div>
      </div>
    </article>
  );
}
