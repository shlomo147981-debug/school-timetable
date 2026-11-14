'use client';

import { useState } from 'react';
import type { Result } from '@/lib/api';
import ConfirmDialog from './ConfirmDialog';

/**
 * כפתור מחיקה אדום עם חלונית אישור.
 * kind="event" → "האם למחוק את האירוע?" · kind="note" → "האם למחוק את ההערה?"
 */
export default function DeleteButton({
  kind, details, onDelete, onDone, compact = false, label,
}: {
  kind: 'event' | 'note';
  /** מה נמחק — מוצג בחלונית האישור */
  details?: string;
  onDelete: () => Promise<Result>;
  onDone?: () => void;
  compact?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const text = label ?? (kind === 'event' ? 'מחק אירוע' : 'מחק הערה');

  const confirm = async () => {
    setPending(true); setError('');
    try {
      const r = await onDelete();
      if (r.ok) { setOpen(false); onDone?.(); } else setError(r.error);
    } catch { setError('המחיקה נכשלה — בדקו את החיבור'); }
    finally { setPending(false); }
  };

  // עוטף הכל (גם חלונית האישור) — כדי שלחיצה כאן לא "תבעבע" לרכיב שמסביב (למשל תא יום בתצוגה חודשית)
  return (
    <span className="contents" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={`${text}${details ? `: ${details}` : ''}`}
        title={text}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={compact
          ? 'shrink-0 rounded px-1 text-xs text-red-700 hover:bg-red-100'
          : 'btn shrink-0 border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100'}
      >
        🗑️{compact ? '' : ` ${text}`}
      </button>
      {open && (
        <ConfirmDialog
          title={kind === 'event' ? 'האם למחוק את האירוע?' : 'האם למחוק את ההערה?'}
          confirmLabel={`🗑️ ${text}`}
          danger
          pending={pending}
          onCancel={() => { setOpen(false); setError(''); }}
          onConfirm={confirm}
        >
          {details && <p className="text-sm text-slate-700">{details}</p>}
          <p className="mt-1 text-xs text-slate-500">
            {kind === 'event' ? 'האירוע יוסר לחלוטין מהמערכת.' : 'ההערה תימחק לחלוטין, גם אם מורה אחר רשם אותה.'}
          </p>
          {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </ConfirmDialog>
      )}
    </span>
  );
}
