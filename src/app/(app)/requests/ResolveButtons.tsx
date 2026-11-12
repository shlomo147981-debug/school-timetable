'use client';

import { useState, useTransition } from 'react';
import { resolveRequest } from '@/app/actions/lesson';

export default function ResolveButtons({ requestId }: { requestId: string }) {
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const act = (status: 'approved' | 'rejected') =>
    start(async () => {
      const r = await resolveRequest({ requestId, status, response });
      if (!r.ok) setError(r.error);
    });
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
      <input className="input flex-1" placeholder="תשובה לתלמיד (אופציונלי)" value={response} onChange={(e) => setResponse(e.target.value)} />
      <button className="btn bg-emerald-600 text-white hover:bg-emerald-700" disabled={pending} onClick={() => act('approved')}>אישור</button>
      <button className="btn bg-slate-200 hover:bg-slate-300" disabled={pending} onClick={() => act('rejected')}>דחייה</button>
      {error && <span className="w-full text-sm text-red-700">{error}</span>}
    </div>
  );
}
