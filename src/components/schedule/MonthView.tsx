'use client';

import { useState } from 'react';
import { SCHOOL_DAYS, heDate, monthGrid } from '@/lib/dates';
import { deleteAssignment, deleteCalendarEvent } from '@/lib/api';
import type { Assignment, CalendarEvent, StudentEvent } from '@/lib/types';
import { ASSIGNMENT_LABEL } from '@/lib/types';
import { STYLE, eventDetails, eventLabel, eventsOn } from './DayHeaderEvents';
import CalendarEventDialog from '../modals/CalendarEventDialog';
import DeleteButton from '../ui/DeleteButton';

/** תצוגת מאקרו: מבחנים, בחנים, משימות, חופשות ואירועים כיתתיים. מחנך/מנהל: 🗑️ מחיקה */
export default function MonthView({
  date, today, calendar, assignments, events, onOpenDay, canEdit = false, onChanged,
}: {
  date: string; today: string; calendar: CalendarEvent[]; assignments: Assignment[];
  events: StudentEvent[]; onOpenDay: (d: string) => void; canEdit?: boolean; onChanged?: () => void;
}) {
  const month = date.slice(0, 7);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  return (
    <div className="card overflow-hidden">
      {editing && <CalendarEventDialog event={editing} onClose={() => setEditing(null)} onChanged={() => onChanged?.()} />}
      <div className="grid grid-cols-5 border-b border-slate-200 bg-slate-50 text-center text-sm font-medium">
        {SCHOOL_DAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      {monthGrid(date).map((week) => (
        <div key={week[0]} className="grid grid-cols-5 border-b border-slate-100 last:border-0">
          {week.map((d) => {
            const inMonth = d.startsWith(month);
            const cal = eventsOn(d, calendar);
            const asg = assignments.filter((a) => a.due_date === d);
            const exceptions = events.filter((e) => e.lesson_date === d && !e.retracted);
            const praise = exceptions.filter((e) => e.type === 'praise').length;
            const notes = exceptions.length - praise;
            return (
              <div
                key={d}
                role="button"
                tabIndex={0}
                aria-label={`פתיחת ${heDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}`}
                onClick={() => onOpenDay(d)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDay(d); } }}
                className={`min-h-24 cursor-pointer border-e border-slate-100 p-1.5 text-start align-top last:border-e-0 hover:bg-brand-50 sm:min-h-28 ${inMonth ? '' : 'bg-slate-50/60 text-slate-400'}`}
              >
                <div className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${d === today ? 'bg-brand-600 text-white' : ''}`}>
                  {Number(d.slice(8))}
                </div>
                <div className="space-y-0.5">
                  {cal.map((e) => (
                    <div key={e.id} className={`flex items-center gap-0.5 rounded px-1 text-[11px] ${STYLE[e.kind]} ${e.source === 'il-calendar' ? 'font-semibold' : ''}`}>
                      {canEdit && e.class_id ? (
                        <button type="button" className="min-w-0 flex-1 truncate text-start hover:underline" aria-label={`עריכת אירוע: ${e.title}`}
                          onClick={(ev) => { ev.stopPropagation(); setEditing(e); }}>{eventLabel(e)}</button>
                      ) : <span className="min-w-0 flex-1 truncate" title={e.note ?? undefined}>{eventLabel(e)}</span>}
                      {canEdit && e.class_id && (
                        <DeleteButton kind="event" compact details={eventDetails(e)} onDelete={() => deleteCalendarEvent(e.id)} onDone={onChanged} />
                      )}
                    </div>
                  ))}
                  {asg.map((a) => (
                    <div key={a.id} title={a.description ?? a.title}
                      className={`flex items-center gap-0.5 rounded px-1 text-[11px] ${a.type === 'exam' || a.type === 'quiz' ? 'bg-red-600 text-white' : 'bg-sky-100 text-sky-800'}`}>
                      <span className="min-w-0 flex-1 truncate">{ASSIGNMENT_LABEL[a.type]}: {a.title}</span>
                      {canEdit && (
                        <DeleteButton kind="event" compact details={`${ASSIGNMENT_LABEL[a.type]}: ${a.title} · ${heDate(a.due_date, { day: 'numeric', month: 'numeric' })}`}
                          onDelete={() => deleteAssignment(a.id)} onDone={onChanged} />
                      )}
                    </div>
                  ))}
                  {(notes > 0 || praise > 0) && (
                    <div className="flex gap-1 text-[11px]">
                      {notes > 0 && <span className="rounded bg-amber-100 px-1 text-amber-900">{notes} הערות</span>}
                      {praise > 0 && <span className="rounded bg-emerald-100 px-1 text-emerald-900">⭐ {praise}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
