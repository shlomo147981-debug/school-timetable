'use client';

import { heDate } from '@/lib/dates';
import type { EditScope } from '@/lib/types';

export const SCOPE_HELP: Record<EditScope, string> = {
  once: 'שינוי חד-פעמי לאותו יום בלבד.',
  week: 'לכל ימי השבוע הנוכחי (א׳–ה׳) באותה משבצת שעה — חד-פעמי לשבוע זה.',
  allDays: 'שינוי קבוע לכל ימי השבוע (א׳–ה׳) באותה משבצת שעה.',
  year: 'שינוי קבוע במערכת השעות — לשיעור הזה בלבד, בכל שבוע.',
};

/** בחירת היקף: רק בתאריך הזה / רק השבוע / כל הימים / לכל השנה */
export default function ScopePicker({
  value, onChange, date, disabled = [],
}: { value: EditScope; onChange: (s: EditScope) => void; date: string; disabled?: EditScope[] }) {
  const options: { id: EditScope; label: string }[] = [
    { id: 'once', label: `רק ב-${heDate(date, { day: 'numeric', month: 'numeric' })}` },
    { id: 'week', label: 'רק השבוע' },
    { id: 'allDays', label: 'כל הימים' },
    { id: 'year', label: 'לכל השנה' },
  ];
  return (
    <div>
      <div role="radiogroup" aria-label="היקף השינוי" className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:grid-cols-4">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id}
            disabled={disabled.includes(o.id)} onClick={() => onChange(o.id)}
            className={`rounded-md px-2 py-1.5 disabled:opacity-40 ${value === o.id ? 'bg-white font-medium text-brand-700 shadow-sm' : 'text-slate-600'}`}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">{SCOPE_HELP[value]}</p>
    </div>
  );
}
