'use client';

import { SCHOOL_DAYS, heDate, weekDates } from '@/lib/dates';
import { holidayOn } from '@/lib/schedule';
import type { CalendarEvent, Occurrence } from '@/lib/types';
import type { EditProps } from './ScheduleBoard';
import LessonCard from './LessonCard';
import DayHeaderEvents from './DayHeaderEvents';

/** לוח שבועי מלא ראשון–חמישי. במובייל הימים נערמים אנכית. */
export default function WeekView({
  date, today, occurrences, calendar, onSelect, edit, onCalendarChanged,
}: {
  date: string; today: string; occurrences: Occurrence[]; calendar: CalendarEvent[];
  onSelect: (o: Occurrence) => void; edit: EditProps; onCalendarChanged?: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
      {weekDates(date).map((d, i) => {
        const holiday = holidayOn(d, calendar);
        const list = occurrences.filter((o) => o.date === d);
        const allPicked = list.length > 0 && list.every((o) => edit.selected.has(o.key));
        return (
          <section key={d} className={`card flex flex-col p-2 ${d === today ? 'ring-2 ring-brand-500' : ''}`}>
            <header className="mb-2 flex items-baseline justify-between gap-1 px-1">
              <h3 className="font-semibold">{SCHOOL_DAYS[i]}</h3>
              <span className="text-xs text-slate-500">{heDate(d, { day: 'numeric', month: 'numeric' })}</span>
              {edit.canEdit && !edit.editMode && !holiday && (
                <button aria-label={`הוספת שיעור ביום ${SCHOOL_DAYS[i]}`} title="הוספת שיעור"
                  className="ms-auto flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100"
                  onClick={() => edit.onAdd(d)}>+</button>
              )}
            </header>
            {edit.editMode && list.length > 0 && (
              <button className="btn mb-2 bg-slate-100 py-1 text-xs" onClick={() => edit.onSelectDay(d)}>
                {allPicked ? 'בטל בחירת יום' : 'בחר יום שלם'}
              </button>
            )}
            <div className="mb-2"><DayHeaderEvents date={d} calendar={calendar} canEdit={edit.canEdit} onChanged={onCalendarChanged} /></div>
            <div className="flex flex-1 flex-col gap-2">
              {holiday ? null : list.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">אין שיעורים</p>
              ) : (
                list.map((o) => (
                  <LessonCard key={o.key} occ={o} compact selectable={edit.editMode} selected={edit.selected.has(o.key)}
                    onClick={() => (edit.editMode ? edit.onToggle(o) : onSelect(o))} />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
