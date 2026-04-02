'use client';

import { useCallback, useEffect, useRef } from 'react';

type MergeDialogProps = {
  sourceTitle: string;
  targetTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function MergeDialog({ sourceTitle, targetTitle, onConfirm, onCancel }: MergeDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onCancel();
  }, [onCancel]);

  return (
    <div className="merge-dialog__backdrop" onClick={handleBackdropClick}>
      <div className="merge-dialog" ref={dialogRef} role="dialog" aria-modal="true">
        <p className="merge-dialog__title">Merge stacks?</p>
        <p className="merge-dialog__body">
          Combine <strong>{sourceTitle}</strong> into <strong>{targetTitle}</strong>. Messages will be merged chronologically.
        </p>
        <div className="merge-dialog__actions">
          <button type="button" className="merge-dialog__btn merge-dialog__btn--cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="merge-dialog__btn merge-dialog__btn--confirm" onClick={onConfirm} autoFocus>
            Merge
          </button>
        </div>
      </div>
    </div>
  );
}
