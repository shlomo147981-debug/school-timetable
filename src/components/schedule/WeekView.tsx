'use client';

import { SCHOOL_DAYS, heDate, weekDates } from '@/lib/dates';
import { holidayOn } from '@/lib/schedule';
import type { CalendarEvent, Occurrence } from '@/lib/types';
import LessonCard from './LessonCard';
import DayHeaderEvents from './DayHeaderEvents';

/** לוח שבועי מלא ראשון–חמישי. במובייל הימים נערמים אנכית. */
export default function WeekView({
  date, today, occurrences, calendar, onSelect,
}: {
  date: string; today: string; occurrences: Occurrence[]; calendar: CalendarEvent[];
  onSelect: (o: Occurrence) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
      {weekDates(date).map((d, i) => {
        const holiday = holidayOn(d, calendar);
        const list = occurrences.filter((o) => o.date === d);
        return (
          <section key={d} className={`card flex flex-col p-2 ${d === today ? 'ring-2 ring-brand-500' : ''}`}>
            <header className="mb-2 flex items-baseline justify-between px-1">
              <h3 className="font-semibold">{SCHOOL_DAYS[i]}</h3>
              <span className="text-xs text-slate-500">{heDate(d, { day: 'numeric', month: 'numeric' })}</span>
            </header>
            <div className="mb-2"><DayHeaderEvents date={d} calendar={calendar} /></div>
            <div className="flex flex-1 flex-col gap-2">
              {holiday ? null : list.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">אין שיעורים</p>
              ) : (
                list.map((o) => <LessonCard key={o.key} occ={o} compact onClick={() => onSelect(o)} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
