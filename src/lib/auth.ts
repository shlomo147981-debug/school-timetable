import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Profile } from './types';

export async function requireProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, full_name, role, class_id')
    .eq('id', user.id)
    .single<Profile>();
  if (!profile) redirect('/login?error=no_profile');

  return { supabase, profile };
}
