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
  isDragging = false,
}: CardStackProps) {
  const [expanded, setExpanded] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
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
        <div>
          <p className="eyebrow">{card.state}</p>
          <h3>{card.title}</h3>
        </div>
        <div className="tempo-chip">
          {card.tempo.label} &middot; {card.tempo.messageCount} msgs
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
        <p className={`card-stack__summary ${expanded ? 'card-stack__summary--hidden' : ''}`}>
          {card.summary}
        </p>

        {expanded && (
          <div className={`card-stack__messages ${showMessages ? 'card-stack__messages--visible' : ''}`}>
            {card.messages.map((msg, i) => {
              const isMe = msg.sender === 'me';
              return (
                <div
                  key={msg.id}
                  className={`card-stack__message ${isMe ? 'card-stack__message--me' : 'card-stack__message--poke'}`}
                  style={{
                    '--fan-index': i,
                    '--fan-delay': `${TIMING.fanInitial + i * TIMING.fanStagger}ms`,
                    '--fan-offset-y': `${FAN.offsetY}px`,
                  } as React.CSSProperties}
                >
                  <p className="card-stack__message-text">{msg.text}</p>
                  <span className="card-stack__message-time">{formatTime(msg.sentAt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card-stack__meta">
        <span>{card.interactionCount} interactions</span>
        <div className="card-stack__actions" onClick={(e) => e.stopPropagation()}>
          {!isArchived && onArchive && (
            <button type="button" className="card-action-btn" onClick={onArchive} aria-label="Archive this stack">
              archive
            </button>
          )}
          {isArchived && onUnarchive && (
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
