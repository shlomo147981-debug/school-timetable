'use client';

import { useState } from 'react';
import { deleteCalendarEvent } from '@/lib/api';
import type { CalendarEvent } from '@/lib/types';
import { CALENDAR_LABEL, EARLY_DISMISSAL_PREFIX } from '@/lib/types';
import ConfirmDialog from '../ui/ConfirmDialog';

export function eventsOn(date: string, calendar: CalendarEvent[]) {
  return calendar.filter((e) => e.start_date <= date && e.end_date >= date);
}

const STYLE = {
  holiday: 'bg-teal-100 text-teal-900',
  trip: 'bg-lime-100 text-lime-900',
  event: 'bg-indigo-100 text-indigo-900',
} as const;

/** אירועי לוח ביום (טיול/חופשה/אירוע/שחרור מוקדם). מחנך יכול למחוק אירוע. */
export default function DayHeaderEvents({
  date, calendar, canEdit = false, onChanged,
}: { date: string; calendar: CalendarEvent[]; canEdit?: boolean; onChanged?: () => void }) {
  const [del, setDel] = useState<CalendarEvent | null>(null);
  const [pending, setPending] = useState(false);
  const list = eventsOn(date, calendar);
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {list.map((e) => {
        const early = e.title.startsWith(EARLY_DISMISSAL_PREFIX);
        return (
          <div key={e.id} className={`flex items-start gap-1 rounded-md px-2 py-1 text-xs ${early ? 'bg-amber-100 font-semibold text-amber-950 ring-1 ring-amber-300' : STYLE[e.kind]}`}>
            <span className="flex-1">
              {early ? <>🔔 {e.title}</> : <><span className="font-medium">{CALENDAR_LABEL[e.kind]}:</span> {e.title}</>}
            </span>
            {canEdit && e.class_id && (
              <button type="button" aria-label={`מחיקת ${e.title}`} title="מחיקה" onClick={() => setDel(e)}
                className="shrink-0 rounded px-1 opacity-60 hover:bg-white/60 hover:opacity-100">✕</button>
            )}
          </div>
        );
      })}
      {del && (
        <ConfirmDialog title="מחיקת אירוע" message={`למחוק את "${del.title}"? (שיעורים שבוטלו בגללו לא ישוחזרו אוטומטית)`}
          confirmLabel="מחיקה" danger pending={pending} onCancel={() => setDel(null)}
          onConfirm={async () => { setPending(true); await deleteCalendarEvent(del.id); setPending(false); setDel(null); onChanged?.(); }} />
      )}
    </div>
  );
}
