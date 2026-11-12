'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** מזהה משתמש ייחודי -> אימייל פנימי ב-Supabase Auth */
const toEmail = (username: string) =>
  `${username.trim().toLowerCase()}@${process.env.NEXT_PUBLIC_LOGIN_DOMAIN ?? 'school.local'}`;

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username.trim()) || !password) {
    return { error: 'יש להזין מזהה משתמש וסיסמה תקינים' };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
  if (error) return { error: 'מזהה משתמש או סיסמה שגויים' };
  redirect('/schedule');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
