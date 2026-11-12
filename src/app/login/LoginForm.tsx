'use client';

import { useActionState } from 'react';
import { login } from '../actions/auth';

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="username" className="label">מזהה משתמש</label>
        <input id="username" name="username" className="input" dir="ltr" autoComplete="username" required />
      </div>
      <div>
        <label htmlFor="password" className="label">סיסמה</label>
        <input id="password" name="password" type="password" className="input" dir="ltr" autoComplete="current-password" required />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? 'מתחבר…' : 'כניסה'}
      </button>
    </form>
  );
}
