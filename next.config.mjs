/**
 * ייצוא סטטי מלא (out/) — ללא שרת. האפליקציה רצה כולה בצד הלקוח ומדברת
 * ישירות עם Supabase; כל ההרשאות נאכפות ב-RLS במסד הנתונים.
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
};
export default nextConfig;
