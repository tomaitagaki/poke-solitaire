'use client';

import { useCallback, useEffect, useState } from 'react';
import type { JournalCard } from '../../shared/journal';

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
};

export function CardStack({
  card,
  isArchived = false,
  userLabels = [],
  onArchive,
  onUnarchive,
  onAddLabel,
  onRemoveLabel,
}: CardStackProps) {
  const [expanded, setExpanded] = useState(false);
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');

  const toggle = useCallback(() => {
    if (!isArchived) setExpanded((prev) => !prev);
  }, [isArchived]);

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
                >
                  x
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {expanded ? (
        <div className="card-stack__messages">
          {card.messages.map((msg) => (
            <div key={msg.id} className="card-stack__message">
              <span className="card-stack__message-time">{formatTime(msg.sentAt)}</span>
              <span className="card-stack__message-sender">{msg.sender ?? 'me'}</span>
              <p className="card-stack__message-text">{msg.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="card-stack__summary">{card.summary}</p>
      )}

      <div className="card-stack__meta">
        <span>{card.interactionCount} interactions</span>
        <div className="card-stack__actions" onClick={(e) => e.stopPropagation()}>
          {!isArchived && onArchive && (
            <button type="button" className="card-action-btn" onClick={onArchive}>archive</button>
          )}
          {isArchived && onUnarchive && (
            <button type="button" className="card-action-btn" onClick={onUnarchive}>restore</button>
          )}
          {onAddLabel && !showLabelInput && (
            <button type="button" className="card-action-btn" onClick={() => setShowLabelInput(true)}>+ label</button>
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
