'use client';

import { hhmm } from '@/lib/dates';
import type { Occurrence } from '@/lib/types';
import { ASSIGNMENT_LABEL, CHANGE_LABEL, EXCEPTION_LABEL } from '@/lib/types';

const EVENT_STYLE: Record<string, string> = {
  praise: 'bg-emerald-100 text-emerald-800',
  absence: 'bg-red-100 text-red-800',
  late: 'bg-amber-100 text-amber-800',
  missing_equipment: 'bg-orange-100 text-orange-800',
  misbehavior: 'bg-rose-100 text-rose-800',
};

export default function LessonCard({
  occ, compact = false, onClick, selectable = false, selected = false,
}: { occ: Occurrence; compact?: boolean; onClick: () => void; selectable?: boolean; selected?: boolean }) {
  const cancelled = occ.status === 'cancelled';
  const changed = occ.status !== 'normal' && !cancelled;
  const visibleEvents = occ.events.filter((e) => !e.retracted);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selectable ? selected : undefined}
      className={`group relative w-full rounded-lg border p-2.5 text-start transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500 ${
        selected ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500'
        : cancelled ? 'border-slate-200 bg-slate-50 opacity-70'
        : occ.personal ? 'border-violet-200 bg-violet-50'
        : changed ? 'border-amber-300 bg-amber-50'
        : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        {selectable && (
          <span aria-hidden className={`flex h-4 w-4 shrink-0 items-center justify-center self-center rounded border text-[10px] ${selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-400 bg-white'}`}>
            {selected ? '✓' : ''}
          </span>
        )}
        <span className={`me-auto font-semibold ${cancelled ? 'line-through' : ''}`}>{occ.subject}</span>
        <span className="shrink-0 text-xs tabular-nums text-slate-500" dir="ltr">
          {hhmm(occ.start)}–{hhmm(occ.end)}
        </span>
      </div>

      <div className="mt-0.5 text-xs text-slate-600">
        {occ.teacherName}
        {occ.room && <>{occ.teacherName ? ' · ' : ''}חדר {occ.room}</>}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {occ.personal && <span className="rounded bg-violet-200 px-1.5 py-0.5 text-[11px] text-violet-900">אישי</span>}
        {occ.status !== 'normal' && (
          <span className={`rounded px-1.5 py-0.5 text-[11px] ${cancelled ? 'bg-slate-200 text-slate-700' : 'bg-amber-200 text-amber-900'}`}>
            {CHANGE_LABEL[occ.status]}
          </span>
        )}
        {occ.assignments.map((a) => (
          <span key={a.id} title={a.title}
            className={`rounded px-1.5 py-0.5 text-[11px] ${a.type === 'exam' || a.type === 'quiz' ? 'bg-red-600 text-white' : 'bg-sky-100 text-sky-800'}`}>
            {ASSIGNMENT_LABEL[a.type]}{!compact && `: ${a.title}`}
          </span>
        ))}
        {visibleEvents.map((e) => (
          <span key={e.id} className={`rounded px-1.5 py-0.5 text-[11px] ${EVENT_STYLE[e.type]}`}>
            {EXCEPTION_LABEL[e.type]}
          </span>
        ))}
      </div>

      {!compact && occ.changeNote && <p className="mt-1 text-xs text-amber-800">{occ.changeNote}</p>}
    </button>
  );
}
