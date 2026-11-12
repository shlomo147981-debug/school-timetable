import type { CapacitorConfig } from '@capacitor/cli';

/**
 * האפליקציה ארוזה כקבצים סטטיים בתוך ה-APK (out/ ← next build עם output: 'export')
 * ומדברת ישירות עם Supabase מהטלפון. אין צורך בשרת חיצוני.
 *
 * פיתוח עם Live Reload (אופציונלי): הריצו `npm run dev` והגדירו
 *   CAP_DEV_URL=http://<IP-של-המחשב>:3000 npx cap run android
 */
const devUrl = process.env.CAP_DEV_URL;

const config: CapacitorConfig = {
  appId: 'il.school.timetable',
  appName: 'מערכת שעות',
  webDir: 'out',
  backgroundColor: '#f8fafc',
  server: devUrl
    ? { url: devUrl, cleartext: devUrl.startsWith('http://') }
    : { androidScheme: 'https' },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: !!devUrl,
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
