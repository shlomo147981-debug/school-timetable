'use client';

import { hhmm } from '@/lib/dates';
import { holidayOn } from '@/lib/schedule';
import type { CalendarEvent, Occurrence } from '@/lib/types';
import LessonCard from './LessonCard';
import DayHeaderEvents from './DayHeaderEvents';

/** תצוגת ציר זמן של שיעורי היום */
export default function DayView({
  date, occurrences, calendar, onSelect,
}: { date: string; occurrences: Occurrence[]; calendar: CalendarEvent[]; onSelect: (o: Occurrence) => void }) {
  const holiday = holidayOn(date, calendar);
  const list = occurrences.filter((o) => o.date === date);

  return (
    <div className="card p-4">
      <div className="mb-4"><DayHeaderEvents date={date} calendar={calendar} /></div>
      {holiday ? (
        <p className="py-10 text-center text-slate-500">🌴 אין לימודים — {holiday.title}</p>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-slate-500">אין שיעורים ביום זה</p>
      ) : (
        <ol className="relative space-y-3 border-s-2 border-brand-100 ps-6">
          {list.map((o) => (
            <li key={o.key} className="relative">
              <span className="absolute -start-[31px] top-3 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
              <div className="mb-1 text-xs font-medium tabular-nums text-slate-500" dir="ltr">{hhmm(o.start)}</div>
              <LessonCard occ={o} onClick={() => onSelect(o)} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
