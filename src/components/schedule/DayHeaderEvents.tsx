'use client';

import { useState } from 'react';
import { deleteCalendarEvent } from '@/lib/api';
import type { CalendarEvent } from '@/lib/types';
import { CALENDAR_LABEL, isDayEndNotice } from '@/lib/types';
import { heDate } from '@/lib/dates';
import DeleteButton from '../ui/DeleteButton';
import CalendarEventDialog from '../modals/CalendarEventDialog';

export function eventsOn(date: string, calendar: CalendarEvent[]) {
  return calendar.filter((e) => e.start_date <= date && e.end_date >= date);
}

export const STYLE = {
  holiday: 'bg-teal-100 text-teal-900 ring-1 ring-teal-300',
  trip: 'bg-lime-100 text-lime-900',
  event: 'bg-indigo-100 text-indigo-900',
} as const;

/** יום בחירה של משרד החינוך (לבדוק מול בית הספר) */
export const isChoiceDay = (e: CalendarEvent) => e.title.startsWith('יום בחירה');

/** צבע: חופשה (טורקיז) · יום לימודים מיוחד (אינדיגו) · יום בחירה (ענבר) · טיול (ירוק) */
export const eventStyle = (e: CalendarEvent) =>
  isChoiceDay(e) ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-300 border-dashed' : STYLE[e.kind];

/** תווית תצוגה: 🏖️ חופשה · 📌 יום לימודים מיוחד · ❓ יום בחירה */
export function eventLabel(e: CalendarEvent) {
  if (isDayEndNotice(e.title)) return `🔔 ${e.title}`;
  if (isChoiceDay(e)) return `❓ ${e.title}`;
  if (e.kind === 'holiday') return `🏖️ ${e.title}`;
  if (e.source === 'il-calendar') return `📌 ${e.title}`;
  return `${CALENDAR_LABEL[e.kind]}: ${e.title}`;
}

/** תת-תווית: האם יש לימודים */
export const studyTag = (e: CalendarEvent) =>
  isChoiceDay(e) ? 'לבדוק מול בית הספר' : e.kind === 'holiday' ? 'אין לימודים' : e.source === 'il-calendar' ? 'יש לימודים' : '';

export const eventDetails = (e: CalendarEvent) =>
  `${eventLabel(e)} · ${heDate(e.start_date, { day: 'numeric', month: 'numeric' })}` +
  (e.end_date !== e.start_date ? `–${heDate(e.end_date, { day: 'numeric', month: 'numeric' })}` : '');

/** אירועי לוח ביום. מחנך/מנהל: לחיצה → עריכה (שם, סוג, תאריכים, הערה) · 🗑️ מחק אירוע */
export default function DayHeaderEvents({
  date, calendar, canEdit = false, onChanged, compact = false,
}: { date: string; calendar: CalendarEvent[]; canEdit?: boolean; onChanged?: () => void; compact?: boolean }) {
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const list = eventsOn(date, calendar);
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {list.map((e) => {
        const early = isDayEndNotice(e.title);
        // אירוע אמיתי של הכיתה (לא הודעה אישית מחושבת) — ניתן לעריכה ולמחיקה
        const editable = canEdit && !!e.class_id && !e.id.startsWith('notice-');
        const label = (
          <span className="flex-1">
            {eventLabel(e)}
            {studyTag(e) && <span className="font-normal"> · {studyTag(e)}</span>}
            {!compact && e.note && <span className="mt-0.5 block font-normal opacity-80">💬 {e.note}</span>}
          </span>
        );
        return (
          <div key={e.id} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${early ? 'bg-amber-100 font-semibold text-amber-950 ring-1 ring-amber-300' : `${eventStyle(e)} ${e.source === 'il-calendar' ? 'font-semibold' : ''}`}`}>
            {editable ? (
              <button type="button" className="flex flex-1 text-start hover:underline" title="עריכת האירוע"
                aria-label={`עריכת אירוע: ${e.title}`} onClick={() => setEditing(e)}>{label}</button>
            ) : label}
            {editable && (
              <DeleteButton kind="event" compact={compact} details={eventDetails(e)}
                onDelete={() => deleteCalendarEvent(e.id)} onDone={onChanged} />
            )}
          </div>
        );
      })}
      {editing && <CalendarEventDialog event={editing} onClose={() => setEditing(null)} onChanged={() => onChanged?.()} />}
    </div>
  );
}
