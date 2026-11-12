'use client';

import { useState } from 'react';
import { addCalendarEvent, applyChanges, restoreChanges, type ChangeRow } from '@/lib/api';
import { addMinutes, hhmm } from '@/lib/dates';
import type { Occurrence } from '@/lib/types';

/** סרגל פעולות גורפות ב"מצב עריכה" — חל על כל השיעורים המסומנים (שינוי חד-פעמי) */
export default function BulkBar({
  selected, classId, onDone, onClear, onExit,
}: { selected: Occurrence[]; classId: string; onDone: (msg: string) => void; onClear: () => void; onExit: () => void }) {
  const [mode, setMode] = useState<'none' | 'shift' | 'special'>('none');
  const [minutes, setMinutes] = useState(15);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'trip' | 'event'>('event');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const n = selected.length;

  // שומר על שינויים קיימים (מחליף/מקצוע) ומוסיף עליהם
  const base = (o: Occurrence): ChangeRow => ({
    lesson_id: o.lesson.id,
    change_date: o.date,
    kind: o.change?.kind ?? 'modified',
    substitute_teacher_id: o.change?.substitute_teacher_id ?? null,
    new_subject: o.change?.new_subject ?? null,
    new_start_time: o.change?.new_start_time ?? null,
    new_end_time: o.change?.new_end_time ?? null,
    new_room: o.change?.new_room ?? null,
    note: o.change?.note ?? null,
  });

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setPending(true); setError('');
    const r = await fn();
    setPending(false);
    if (r.ok) { setMode('none'); onDone(msg); } else setError(r.error ?? 'שגיאה');
  };

  const cancelAll = () => run(() => applyChanges(selected.map((o) => ({ ...base(o), kind: 'cancelled' }))), `${n} שיעורים בוטלו`);
  const restoreAll = () => run(() => restoreChanges(selected.map((o) => ({ lessonId: o.lesson.id, date: o.date }))), `${n} שיעורים שוחזרו`);
  const shiftAll = () => run(() => applyChanges(selected.map((o) => ({
    ...base(o),
    kind: o.status === 'normal' || o.status === 'moved' ? 'moved' : 'modified',
    new_start_time: addMinutes(hhmm(o.start), minutes),
    new_end_time: addMinutes(hhmm(o.end), minutes),
  }))), `${n} שיעורים הוזזו ב-${minutes} דקות`);
  const special = () => run(async () => {
    if (!title.trim()) return { ok: false, error: 'יש להזין שם לפעילות' };
    const r = await applyChanges(selected.map((o) => ({ ...base(o), kind: 'cancelled', note: title.trim() })));
    if (!r.ok) return r;
    for (const d of [...new Set(selected.map((o) => o.date))].sort()) {
      const e = await addCalendarEvent({ classId, kind, title, startDate: d, endDate: d });
      if (!e.ok) return e;
    }
    return { ok: true };
  }, `הוחלף בפעילות: ${title}`);

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
      <div className="mx-auto max-w-7xl space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{n ? `${n} שיעורים מסומנים` : 'סמנו שיעורים או "בחר יום שלם"'}</span>
          <div className="ms-auto flex flex-wrap gap-1.5">
            <button className="btn bg-red-50 text-red-700 hover:bg-red-100" disabled={!n || pending} onClick={cancelAll}>ביטול</button>
            <button className={`btn ${mode === 'shift' ? 'bg-brand-100' : 'bg-slate-100'}`} disabled={!n || pending} onClick={() => setMode(mode === 'shift' ? 'none' : 'shift')}>הזזת זמנים</button>
            <button className={`btn ${mode === 'special' ? 'bg-brand-100' : 'bg-slate-100'}`} disabled={!n || pending} onClick={() => setMode(mode === 'special' ? 'none' : 'special')}>פעילות מיוחדת</button>
            <button className="btn bg-slate-100" disabled={!n || pending} onClick={restoreAll}>שחזור</button>
            <button className="btn-ghost" disabled={!n} onClick={onClear}>ניקוי</button>
            <button className="btn-primary" onClick={onExit}>סיום</button>
          </div>
        </div>
        {mode === 'shift' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>הזזה ב-</span>
            {[-30, -15, 15, 30, 45].map((m) => (
              <button key={m} className={`btn ${minutes === m ? 'bg-brand-100 text-brand-700' : 'bg-slate-100'}`} onClick={() => setMinutes(m)} dir="ltr">{m > 0 ? `+${m}` : m}</button>
            ))}
            <input type="number" className="input w-20" value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 0)} aria-label="דקות" />
            <span>דקות</span>
            <button className="btn-primary" disabled={pending || !minutes} onClick={shiftAll}>החלה</button>
          </div>
        )}
        {mode === 'special' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value as 'trip' | 'event')} aria-label="סוג">
              <option value="event">יום שיא / אירוע</option>
              <option value="trip">טיול</option>
            </select>
            <input className="input flex-1" placeholder="שם הפעילות (למשל: טיול שנתי)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button className="btn-primary" disabled={pending} onClick={special}>החלפה</button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
