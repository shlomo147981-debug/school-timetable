'use client';

import { hhmm, minutesBetween } from '@/lib/dates';
import { holidayOn } from '@/lib/schedule';
import type { CalendarEvent, Occurrence } from '@/lib/types';
import type { EditProps } from './ScheduleBoard';
import LessonCard from './LessonCard';
import DayHeaderEvents from './DayHeaderEvents';

/** תצוגת ציר זמן של שיעורי היום, כולל הפסקות */
export default function DayView({
  date, occurrences, calendar, onSelect, edit, onCalendarChanged,
}: { date: string; occurrences: Occurrence[]; calendar: CalendarEvent[]; onSelect: (o: Occurrence) => void; edit: EditProps; onCalendarChanged?: () => void }) {
  const holiday = holidayOn(date, calendar);
  // שיעור שנמחק לא קיים בתצוגה; רק מחנך במצב עריכה רואה אותו (כדי לשחזר)
  const list = occurrences.filter((o) => o.date === date && (o.status !== 'removed' || edit.showRemoved));
  const active = list.filter((o) => o.status !== 'cancelled' && o.status !== 'removed');
  const allPicked = list.length > 0 && list.every((o) => edit.selected.has(o.key));

  // הפסקה = פער של 10+ דקות בין סיום שיעור (פעיל) לתחילת הבא
  const breakBefore = (o: Occurrence) => {
    const prev = [...active].reverse().find((p) => p.start < o.start && p.key !== o.key);
    if (!prev || o.status === 'cancelled') return null;
    const gap = minutesBetween(hhmm(prev.end), hhmm(o.start));
    return gap >= 10 ? { from: hhmm(prev.end), to: hhmm(o.start), gap } : null;
  };

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-start gap-2">
        <div className="flex-1"><DayHeaderEvents date={date} calendar={calendar} canEdit={edit.canEdit} onChanged={onCalendarChanged} /></div>
        {edit.editMode && list.length > 0 && (
          <button className="btn bg-slate-100 text-xs" onClick={() => edit.onSelectDay(date)}>
            {allPicked ? 'בטל בחירת יום' : 'בחר יום שלם'}
          </button>
        )}
      </div>
      {holiday ? (
        <p className="py-10 text-center text-slate-500">🌴 אין לימודים — {holiday.title}{holiday.note && <span className="mt-1 block text-sm">💬 {holiday.note}</span>}</p>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-slate-500">אין שיעורים ביום זה</p>
      ) : (
        <ol className="relative space-y-3 border-s-2 border-brand-100 ps-6">
          {list.map((o) => {
            const br = breakBefore(o);
            return (
              <li key={o.key} className="relative">
                {br && (
                  <div className="-ms-6 mb-3 flex items-center gap-2 ps-6 text-xs text-slate-400">
                    <span className="h-px flex-1 border-t border-dashed border-slate-300" />
                    ☕ הפסקה <span dir="ltr">{br.from}–{br.to}</span>
                    <span className="h-px flex-1 border-t border-dashed border-slate-300" />
                  </div>
                )}
                <span className="absolute -start-[31px] bottom-8 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
                <div className="mb-1 text-xs font-medium tabular-nums text-slate-500" dir="ltr">{hhmm(o.start)}</div>
                <LessonCard occ={o} notesSummary={edit.notesSummary} selectable={edit.editMode} selected={edit.selected.has(o.key)}
                  onClick={() => (edit.editMode ? edit.onToggle(o) : onSelect(o))} />
              </li>
            );
          })}
        </ol>
      )}
      {edit.canEdit && !holiday && (
        <button className="btn mt-4 w-full border border-dashed border-brand-300 text-brand-700 hover:bg-brand-50" onClick={() => edit.onAdd(date)}>
          ➕ הוספת שיעור / פעילות
        </button>
      )}
    </div>
  );
}
