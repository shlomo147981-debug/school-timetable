'use client';

import { useState } from 'react';

export type Audience = 'class' | 'students';
interface Student { id: string; full_name: string }

/**
 * בורר קהל יעד: "כל הכיתה" או "תלמידים נבחרים" (תיבות סימון + חיפוש + בחר הכל / נקה).
 * בחירת תלמידים → כל שינוי נשמר בנפרד לכל תלמיד שסומן (student_id); שאר הכיתה לא מושפעת.
 */
export default function AudiencePicker({
  audience, onAudience, students, selected, onSelected, compact = false,
}: {
  audience: Audience; onAudience: (a: Audience) => void;
  students: Student[]; selected: string[]; onSelected: (ids: string[]) => void; compact?: boolean;
}) {
  const [q, setQ] = useState('');
  const shown = students.filter((s) => s.full_name.includes(q.trim()));
  const toggle = (id: string) => onSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="קהל יעד" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm">
        <button type="button" role="radio" aria-checked={audience === 'class'} onClick={() => onAudience('class')}
          className={`rounded-lg px-2 py-2 ${audience === 'class' ? 'bg-white font-semibold text-brand-700 shadow-sm' : 'text-slate-600'}`}>
          👥 כל הכיתה
        </button>
        <button type="button" role="radio" aria-checked={audience === 'students'} onClick={() => onAudience('students')}
          className={`rounded-lg px-2 py-2 ${audience === 'students' ? 'bg-white font-semibold text-violet-700 shadow-sm' : 'text-slate-600'}`}>
          👤 תלמידים נבחרים{selected.length ? ` (${selected.length})` : ''}
        </button>
      </div>

      {audience === 'students' && (
        <div className="rounded-xl border border-violet-200 bg-white p-2">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <input className="input min-w-0 flex-1 py-1.5" placeholder="חיפוש תלמיד…" aria-label="חיפוש תלמיד" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="button" className="btn bg-slate-100 py-1.5 text-xs"
              onClick={() => onSelected([...new Set([...selected, ...shown.map((s) => s.id)])])}>בחר הכל</button>
            <button type="button" className="btn-ghost py-1.5 text-xs" disabled={!selected.length} onClick={() => onSelected([])}>נקה</button>
          </div>
          <div className={`grid grid-cols-1 gap-0.5 overflow-y-auto sm:grid-cols-2 ${compact ? 'max-h-40' : 'max-h-56'}`}>
            {shown.map((s) => (
              <label key={s.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${selected.includes(s.id) ? 'bg-violet-50 font-medium' : 'hover:bg-slate-50'}`}>
                <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} aria-label={s.full_name} />
                {s.full_name}
              </label>
            ))}
            {students.length === 0 && <p className="p-2 text-center text-xs text-slate-400">אין תלמידים בכיתה — הוסיפו במסך ניהול משתמשים</p>}
            {students.length > 0 && shown.length === 0 && <p className="p-2 text-center text-xs text-slate-400">לא נמצאו תלמידים</p>}
          </div>
        </div>
      )}
    </div>
  );
}
