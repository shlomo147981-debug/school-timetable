'use client';

import { deleteCalendarEvent } from '@/lib/api';
import type { CalendarEvent } from '@/lib/types';
import { CALENDAR_LABEL, isDayEndNotice } from '@/lib/types';
import { heDate } from '@/lib/dates';
import DeleteButton from '../ui/DeleteButton';

export function eventsOn(date: string, calendar: CalendarEvent[]) {
  return calendar.filter((e) => e.start_date <= date && e.end_date >= date);
}

const STYLE = {
  holiday: 'bg-teal-100 text-teal-900',
  trip: 'bg-lime-100 text-lime-900',
  event: 'bg-indigo-100 text-indigo-900',
} as const;

export const eventDetails = (e: CalendarEvent) =>
  `${CALENDAR_LABEL[e.kind]}: ${e.title} · ${heDate(e.start_date, { day: 'numeric', month: 'numeric' })}` +
  (e.end_date !== e.start_date ? `–${heDate(e.end_date, { day: 'numeric', month: 'numeric' })}` : '');

/** אירועי לוח ביום (טיול/חופשה/אירוע/סיום יום). מחנך/מנהל: 🗑️ מחק אירוע. */
export default function DayHeaderEvents({
  date, calendar, canEdit = false, onChanged, compact = false,
}: { date: string; calendar: CalendarEvent[]; canEdit?: boolean; onChanged?: () => void; compact?: boolean }) {
  const list = eventsOn(date, calendar);
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {list.map((e) => {
        const early = isDayEndNotice(e.title);
        // אירוע אמיתי של הכיתה (לא הודעה אישית מחושבת) — ניתן למחיקה
        const deletable = canEdit && !!e.class_id && !e.id.startsWith('notice-');
        return (
          <div key={e.id} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${early ? 'bg-amber-100 font-semibold text-amber-950 ring-1 ring-amber-300' : STYLE[e.kind]}`}>
            <span className="flex-1">
              {early ? <>🔔 {e.title}</> : <><span className="font-medium">{CALENDAR_LABEL[e.kind]}:</span> {e.title}</>}
            </span>
            {deletable && (
              <DeleteButton kind="event" compact={compact} details={eventDetails(e)}
                onDelete={() => deleteCalendarEvent(e.id)} onDone={onChanged} />
            )}
          </div>
        );
      })}
    </div>
  );
}
