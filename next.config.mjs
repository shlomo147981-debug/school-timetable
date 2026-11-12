import { readFileSync } from 'node:fs';

/**
 * ייצוא סטטי מלא (out/) — ללא שרת. האפליקציה רצה כולה בצד הלקוח ומדברת
 * ישירות עם Supabase; כל ההרשאות נאכפות ב-RLS במסד הנתונים.
 *
 * PAGES_BASE_PATH=/school-timetable — לבנייה עבור GitHub Pages (תת-תיקייה).
 * ב-APK הבנייה היא בשורש (ללא basePath).
 */
let version = { version: '0.0.0', build: 0, commit: 'dev' };
try { version = JSON.parse(readFileSync('./public/version.json', 'utf8')); } catch { /* dev */ }

const basePath = process.env.PAGES_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath,
  env: {
    NEXT_PUBLIC_APP_VERSION: String(version.version),
    NEXT_PUBLIC_APP_BUILD: String(version.build),
    NEXT_PUBLIC_APP_COMMIT: String(version.commit),
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};
export default nextConfig;
