import type { CalendarEvent } from '@/lib/types';
import { CALENDAR_LABEL } from '@/lib/types';

export function eventsOn(date: string, calendar: CalendarEvent[]) {
  return calendar.filter((e) => e.start_date <= date && e.end_date >= date);
}

const STYLE = {
  holiday: 'bg-teal-100 text-teal-900',
  trip: 'bg-lime-100 text-lime-900',
  event: 'bg-indigo-100 text-indigo-900',
} as const;

export default function DayHeaderEvents({ date, calendar }: { date: string; calendar: CalendarEvent[] }) {
  const list = eventsOn(date, calendar);
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {list.map((e) => (
        <div key={e.id} className={`rounded-md px-2 py-1 text-xs ${STYLE[e.kind]}`}>
          <span className="font-medium">{CALENDAR_LABEL[e.kind]}:</span> {e.title}
        </div>
      ))}
    </div>
  );
}
