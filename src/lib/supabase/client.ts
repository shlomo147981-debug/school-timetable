import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * לקוח Supabase יחיד לכל האפליקציה (דפדפן / WebView של אנדרואיד).
 * הסשן נשמר ב-localStorage ומתרענן אוטומטית — המשתמש נשאר מחובר בין פתיחות.
 * אבטחה: המפתח הציבורי (publishable/anon) בלבד. כל ההרשאות נאכפות ב-RLS.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: 'school-timetable-auth',
        },
      },
    );
  }
  return client;
}
