import type { CapacitorConfig } from '@capacitor/cli';

/**
 * ============================================================================
 *  כתובת השרת החיה של אפליקציית ה-Next.js
 * ============================================================================
 *  האפליקציה משתמשת ב-SSR, Middleware ו-Server Actions (התחברות עם עוגיות,
 *  שמירת הערות/משימות), ולכן אי אפשר לייצא אותה סטטית (output: 'export').
 *  מעטפת האנדרואיד טוענת את האתר החי בתוך WebView מקורי.
 *
 *  👉 הדביקו כאן את כתובת ה-HTTPS של האתר (למשל אחרי פריסה ל-Vercel):
 *       const SERVER_URL = 'https://my-school.vercel.app';
 *     או העבירו בזמן build:  CAP_SERVER_URL=https://... npx cap sync android
 *
 *  אם הכתובת ריקה — האפליקציה תציג מסך הסבר מקומי (mobile-shell/index.html).
 *  לפיתוח מקומי מול המחשב שלכם: CAP_SERVER_URL=http://192.168.1.20:3000
 *  (cleartext מופעל אוטומטית רק לכתובות http).
 * ============================================================================
 */
const SERVER_URL = process.env.CAP_SERVER_URL ?? '';

const isHttp = SERVER_URL.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'il.school.timetable',
  appName: 'מערכת שעות',
  webDir: 'mobile-shell',
  backgroundColor: '#f8fafc',
  server: SERVER_URL
    ? {
        url: SERVER_URL,
        cleartext: isHttp,
        // דף שיוצג אם אין רשת / השרת לא זמין (מתוך mobile-shell)
        errorPath: 'offline.html',
        allowNavigation: [new URL(SERVER_URL).host, '*.supabase.co'],
      }
    : { androidScheme: 'https' },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: isHttp, // דיבאג ב-chrome://inspect רק בפיתוח מקומי
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT',
      backgroundColor: '#2459c9',
    },
  },
};

export default config;
