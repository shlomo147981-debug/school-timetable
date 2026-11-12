'use client';

import { SCHOOL_DAYS, monthGrid } from '@/lib/dates';
import type { Assignment, CalendarEvent, StudentEvent } from '@/lib/types';
import { ASSIGNMENT_LABEL, CALENDAR_LABEL } from '@/lib/types';
import { eventsOn } from './DayHeaderEvents';

/** תצוגת מאקרו: מבחנים, בחנים, משימות, חופשות ואירועים כיתתיים */
export default function MonthView({
  date, today, calendar, assignments, events, onOpenDay,
}: {
  date: string; today: string; calendar: CalendarEvent[]; assignments: Assignment[];
  events: StudentEvent[]; onOpenDay: (d: string) => void;
}) {
  const month = date.slice(0, 7);
  return (
    <div className="card overflow-hidden">
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
              <button
                key={d}
                type="button"
                onClick={() => onOpenDay(d)}
                className={`min-h-24 border-e border-slate-100 p-1.5 text-start align-top last:border-e-0 hover:bg-brand-50 sm:min-h-28 ${inMonth ? '' : 'bg-slate-50/60 text-slate-400'}`}
              >
                <div className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${d === today ? 'bg-brand-600 text-white' : ''}`}>
                  {Number(d.slice(8))}
                </div>
                <div className="space-y-0.5">
                  {cal.map((e) => (
                    <div key={e.id} className={`truncate rounded px-1 text-[11px] ${e.kind === 'holiday' ? 'bg-teal-100 text-teal-900' : e.kind === 'trip' ? 'bg-lime-100 text-lime-900' : 'bg-indigo-100 text-indigo-900'}`}>
                      {CALENDAR_LABEL[e.kind]}: {e.title}
                    </div>
                  ))}
                  {asg.map((a) => (
                    <div key={a.id} title={a.description ?? a.title}
                      className={`truncate rounded px-1 text-[11px] ${a.type === 'exam' || a.type === 'quiz' ? 'bg-red-600 text-white' : 'bg-sky-100 text-sky-800'}`}>
                      {ASSIGNMENT_LABEL[a.type]}: {a.title}
                    </div>
                  ))}
                  {(notes > 0 || praise > 0) && (
                    <div className="flex gap-1 text-[11px]">
                      {notes > 0 && <span className="rounded bg-amber-100 px-1 text-amber-900">{notes} הערות</span>}
                      {praise > 0 && <span className="rounded bg-emerald-100 px-1 text-emerald-900">⭐ {praise}</span>}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
