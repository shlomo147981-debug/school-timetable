'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { resolveRequest } from '@/lib/api';
import { heDate } from '@/lib/dates';
import { EXCEPTION_LABEL, REQUEST_KIND_LABEL, REQUEST_STATUS_LABEL, isStaff } from '@/lib/types';
import type { ExceptionType, Profile, RequestKind, RequestStatus } from '@/lib/types';

interface Row {
  id: string; kind: RequestKind; status: RequestStatus; message: string; response: string | null;
  created_at: string; lesson_date: string | null; attachment_path: string | null;
  student: { full_name: string } | null;
  teacher: { full_name: string } | null;
  lesson: { subject: string } | null;
  event: { type: ExceptionType; note: string | null } | null;
  signedUrl?: string;
}

export default function RequestsScreen({ profile }: { profile: Profile }) {
  const staff = isStaff(profile.role);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const supabase = getSupabase();
    // RLS מסנן: מורה — בקשות אליו (+ מחנך: כל הכיתה), תלמיד — שלו, הורה — של ילדיו
    const { data, error: err } = await supabase
      .from('student_requests')
      .select(`id, kind, status, message, response, created_at, lesson_date, attachment_path,
        student:profiles!student_requests_student_id_fkey(full_name),
        teacher:profiles!student_requests_teacher_id_fkey(full_name),
        lesson:lessons(subject),
        event:student_events(type, note)`)
      .order('status')
      .order('created_at', { ascending: false })
      .limit(100);
    if (err) { setError('טעינת הבקשות נכשלה'); setRows([]); return; }
    const list = (data ?? []) as unknown as Row[];
    await Promise.all(list.filter((r) => r.attachment_path).map(async (r) => {
      const { data: s } = await supabase.storage.from('request-attachments').createSignedUrl(r.attachment_path!, 600);
      r.signedUrl = s?.signedUrl;
    }));
    setError('');
    setRows(list);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{staff ? 'בקשות תלמידים' : 'הבקשות שלי'}</h1>
      {error && <div className="card border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {rows === null && <div className="card p-10 text-center text-slate-400">טוען…</div>}
      {rows?.length === 0 && !error && <div className="card p-10 text-center text-slate-500">אין בקשות</div>}
      {rows?.map((r) => (
        <article key={r.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === 'open' ? 'bg-amber-100 text-amber-900' : r.status === 'approved' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-700'}`}>
              {REQUEST_STATUS_LABEL[r.status]}
            </span>
            <span className="font-semibold">{REQUEST_KIND_LABEL[r.kind]}</span>
            <span className="text-slate-500">
              · {staff ? r.student?.full_name : `אל: ${r.teacher?.full_name}`}
              {r.lesson && ` · ${r.lesson.subject}`}
              {r.lesson_date && ` · ${heDate(r.lesson_date, { day: 'numeric', month: 'short' })}`}
            </span>
          </div>
          {r.event && (
            <p className="mt-1 text-xs text-slate-500">בנוגע ל: {EXCEPTION_LABEL[r.event.type]}{r.event.note && ` — ${r.event.note}`}</p>
          )}
          <p className="mt-2 whitespace-pre-line">{r.message}</p>
          {r.signedUrl && (
            <a href={r.signedUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-brand-600 underline">📎 צפייה בצרופה</a>
          )}
          {r.response && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm"><b>תשובת המורה:</b> {r.response}</p>}
          {staff && r.status === 'open' && <ResolveButtons requestId={r.id} onDone={load} />}
        </article>
      ))}
    </div>
  );
}

function ResolveButtons({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const act = async (status: 'approved' | 'rejected') => {
    setPending(true);
    const r = await resolveRequest({ requestId, status, response });
    setPending(false);
    if (r.ok) onDone(); else setError(r.error);
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
      <input className="input flex-1" placeholder="תשובה לתלמיד (אופציונלי)" value={response} onChange={(e) => setResponse(e.target.value)} />
      <button className="btn bg-emerald-600 text-white hover:bg-emerald-700" disabled={pending} onClick={() => act('approved')}>אישור</button>
      <button className="btn bg-slate-200 hover:bg-slate-300" disabled={pending} onClick={() => act('rejected')}>דחייה</button>
      {error && <span className="w-full text-sm text-red-700">{error}</span>}
    </div>
  );
}
