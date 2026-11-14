'use client';

import { useState } from 'react';
import Modal from '../ui/Modal';
import DeleteButton from '../ui/DeleteButton';
import { calendarNoteSupported, deleteCalendarEvent, updateCalendarEvent, type CalendarFields } from '@/lib/api';
import type { CalendarEvent } from '@/lib/types';
import { eventDetails } from '../schedule/DayHeaderEvents';

const KINDS: { id: CalendarFields['kind']; label: string; hint: string }[] = [
  { id: 'holiday', label: '🏖️ חופשה', hint: 'אין לימודים — השיעורים לא יוצגו' },
  { id: 'event', label: '📌 אירוע / מועד', hint: 'יום לימודים רגיל, עם הודעה' },
  { id: 'trip', label: '🚌 טיול', hint: 'מוצג כטיול' },
];

/** עריכת אירוע לוח (חג, חופשה, טיול, הודעה) — מחנך / מנהל */
export default function CalendarEventDialog({ event, onClose, onChanged }: { event: CalendarEvent; onClose: () => void; onChanged: () => void }) {
  const [title, setTitle] = useState(event.title);
  const [kind, setKind] = useState<CalendarFields['kind']>(event.kind);
  const [startDate, setStartDate] = useState(event.start_date);
  const [endDate, setEndDate] = useState(event.end_date);
  const [note, setNote] = useState(event.note ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true); setError('');
    const r = await updateCalendarEvent(event.id, { title, kind, startDate, endDate, note });
    setPending(false);
    if (r.ok) { onChanged(); onClose(); } else setError(r.error);
  };

  return (
    <Modal title="עריכת אירוע" subtitle={event.source === 'il-calendar' ? '🇮🇱 מלוח השנה הישראלי — אפשר להתאים ללוח החופשות של בית הספר' : undefined} onClose={onClose}>
      <form className="space-y-4" onSubmit={save}>
        <div>
          <label className="label" htmlFor="ce-title">שם</label>
          <input id="ce-title" className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <span className="label">סוג</span>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="סוג האירוע">
            {KINDS.map((k) => (
              <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}
                className={`rounded-lg border px-2 py-2 text-sm ${kind === k.id ? 'border-brand-500 bg-brand-50 font-medium' : 'border-slate-200'}`}>
                {k.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">{KINDS.find((k) => k.id === kind)?.hint}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="ce-start">מתאריך</label>
            <input id="ce-start" type="date" className="input" required value={startDate}
              onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />
          </div>
          <div>
            <label className="label" htmlFor="ce-end">עד תאריך (כולל)</label>
            <input id="ce-end" type="date" className="input" required min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ce-note">הערה לתלמידים ולהורים</label>
          <textarea id="ce-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="למשל: חוזרים ללימודים ביום ב'" disabled={!calendarNoteSupported()} />
          {!calendarNoteSupported() && <p className="mt-1 text-xs text-amber-700">ההערה תישמר אחרי הרצת SETUP_UPGRADE_0008.sql</p>}
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <DeleteButton kind="event" details={eventDetails(event)} onDelete={() => deleteCalendarEvent(event.id)} onDone={() => { onChanged(); onClose(); }} />
          <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'שומר…' : 'שמירה'}</button>
        </div>
      </form>
    </Modal>
  );
}
